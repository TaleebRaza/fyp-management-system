import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import mongoose, { ClientSession } from 'mongoose';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import VoiceNote from '../../../../models/VoiceNote';
import { sendNotificationEmail } from '../../../../lib/mailer';
import { reserveSupervisorCapacity } from '../../../../lib/supervisorCapacity';
import { withTransactionRetry } from '../../../../lib/transactionUtils';
import { assignStudentSupervisor, updateStudentProgramBatch } from '../../../../lib/studentDashboardActions';
import { dedupeR2DeletionTargets, toR2DeletionTarget, type R2DeletionTarget } from '../../../../lib/r2Cleanup';
import { deleteR2Targets } from '../../../../lib/r2Deletion';
import SystemConfig from '../../../../models/SystemConfig';
import { DEFAULT_PROJECT_STAGE, PROJECT_STAGES } from '../../../../config/appSettings';
import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
  validateProjectDomainIds,
} from '../../../../config/projectDomains';

export const dynamic = 'force-dynamic';

async function createFreshStudentProject(
  studentId: mongoose.Types.ObjectId,
  session: ClientSession,
  supervisorId: mongoose.Types.ObjectId | null = null
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      const newProject = new Project({
        supervisorId,
        members: [studentId],
        inviteCode,
        stage: DEFAULT_PROJECT_STAGE,
        status: 'Pending',
        title: '',
        titleFingerprint: '',
        domain: '',
        domains: [],
        pdfUrl: '',
        pdfSize: 0,
      });

      await newProject.save({ session });
      return newProject;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
  }

  throw new Error('Failed to generate a unique project invite code.');
}

export async function GET(req: Request) {
  try {
    const token = await getToken({
      req: req as any,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token || token.role !== 'student' || !(token as any).id) {
      return NextResponse.json({ error: 'Unauthorized student request.' }, { status: 401 });
    }

    const studentId = String((token as any).id);

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return NextResponse.json({ error: 'Invalid student account.' }, { status: 400 });
    }

    await connectToDatabase();

    // Use the authenticated student's ID and return only dashboard-safe fields.
    const student = await User.findOne({ _id: studentId, role: 'student' })
      .select(
        '_id name email rollNo role program batch semester supervisorId status remarks projectTitle pdfUrl projectDesc domain domains tools notificationsEnabled isActive projectId lateRegistrationDays lateRegistrationFine'
      )
      .lean();

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Fetch the supervisor and project in parallel without adding another fine-related query.
    const [supervisor, project] = await Promise.all([
      student.supervisorId
        ? User.findById(student.supervisorId)
            .select('_id name email broadcastType broadcastContent broadcastSize broadcastCreatedAt')
            .lean()
        : null,
      student.projectId
        ? Project.findById(student.projectId)
            .populate('members', 'name rollNo email')
            .lean()
        : null,
    ]);

    const supervisorBroadcast = supervisor?.broadcastType && supervisor?.broadcastContent
      ? {
          type: supervisor.broadcastType,
          content: supervisor.broadcastContent,
          size: supervisor.broadcastSize || 0,
          createdAt: supervisor.broadcastCreatedAt || null,
          supervisorName: supervisor.name || 'Supervisor',
        }
      : null;

    const projectRecord = project as any;
    const studentRecord = student as any;
    const storedDomainIds =
      Array.isArray(projectRecord?.domains) && projectRecord.domains.length > 0
        ? projectRecord.domains
        : studentRecord.domains;
    const normalizedDomains = normalizeProjectDomainIds(
      storedDomainIds,
      projectRecord?.domain || studentRecord.domain
    );
    const normalizedDomainText = formatProjectDomainLabels(
      normalizedDomains,
      projectRecord?.domain || studentRecord.domain
    );

    const studentResponse = {
      ...studentRecord,
      domains: normalizedDomains,
      domain: normalizedDomainText,
    };

    const projectResponse = projectRecord
      ? {
          ...projectRecord,
          domains: normalizedDomains,
          domain: normalizedDomainText,
        }
      : projectRecord;

    return NextResponse.json(
      {
        student: studentResponse,
        supervisor,
        project: projectResponse,
        supervisorBroadcast,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Student Dashboard GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();

        // ==========================================
    // ACTION: STUDENT PROGRAM/BATCH SELF UPDATE
    // ==========================================
    if (body.action === 'updateProgramBatch') {
      return updateStudentProgramBatch(req, body);
    }

    // ==========================================
    // ACTION: CHANGE SUPERVISOR (student starts fresh)
    // ==========================================
    if (body.action === 'changeSupervisor') {
      const token = (await getToken({ req: req as any, secret: process.env.NEXTAUTH_SECRET })) as any;

      if (!token || token.role !== 'student' || String(token.id) !== String(body.id)) {
        return NextResponse.json({ error: 'Unauthorized supervisor change request.' }, { status: 401 });
      }

      const studentId = String(body.id || '').trim();
      const newSupervisorId = String(body.supervisorId || '').trim();

      if (!mongoose.Types.ObjectId.isValid(studentId) || !mongoose.Types.ObjectId.isValid(newSupervisorId)) {
        return NextResponse.json({ error: 'Invalid student or supervisor.' }, { status: 400 });
      }

      const session = await mongoose.startSession();

      try {
        const result = await withTransactionRetry(session, async () => {
        let deletionTargets: R2DeletionTarget[] = [];
        let freedBytes = 0;
        let leftTeam = false;
        const student = await User.findById(studentId).session(session);

        if (!student || student.role !== 'student') {
          return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
        }

        if (String(student.supervisorId || '') === newSupervisorId) {
          return NextResponse.json({ error: 'You are already assigned to this supervisor.' }, { status: 400 });
        }

        const capacity = await reserveSupervisorCapacity(newSupervisorId, session);

        if (capacity.kind === 'missing') {
          return NextResponse.json({ error: 'Selected supervisor was not found.' }, { status: 404 });
        }

        if (capacity.kind === 'full') {
          return NextResponse.json(
            { error: `Cannot change supervisor. The selected supervisor is full (${capacity.maxSlots} slots).` },
            { status: 409 }
          );
        }

        const targetSupervisor = capacity.supervisor;

        const oldProject = student.projectId
          ? await Project.findById(student.projectId).session(session)
          : null;

        if (oldProject) {
          const projectIsLocked = oldProject.status === 'Approved' || oldProject.stage !== DEFAULT_PROJECT_STAGE;

          if (projectIsLocked) {
            return NextResponse.json(
              {
                error:
                  'Supervisor change is blocked because this project has already been approved. Use migration instead.',
              },
              { status: 403 }
            );
          }

          const oldProjectMembers = Array.isArray(oldProject.members) ? oldProject.members : [];
          const isOnlyMember =
            oldProjectMembers.length <= 1 ||
            oldProjectMembers.every((member: any) => String(member) === String(student._id));

          if (isOnlyMember) {
            const voiceNotes = await VoiceNote.find({ projectId: oldProject._id }).session(session);

            deletionTargets = dedupeR2DeletionTargets([
              toR2DeletionTarget(oldProject.pdfUrl, oldProject.pdfSize),
              String(student.pdfUrl || '') !== String(oldProject.pdfUrl || '')
                ? toR2DeletionTarget(student.pdfUrl, oldProject.pdfSize)
                : null,
              ...voiceNotes
                .map((note: any) => toR2DeletionTarget(note.blobUrl, note.fileSize))
                .filter(Boolean),
            ].filter(Boolean) as R2DeletionTarget[]);

            freedBytes = deletionTargets.reduce((sum, target) => sum + target.size, 0);
            await deleteR2Targets(deletionTargets);

            if (voiceNotes.length > 0) {
              await VoiceNote.deleteMany({
                _id: { $in: voiceNotes.map((note: any) => note._id) },
              }).session(session);
            }

            await Project.findByIdAndDelete(oldProject._id, { session });
          } else {
            leftTeam = true;

            await Project.findByIdAndUpdate(
              oldProject._id,
              { $pull: { members: student._id } },
              { session }
            );
          }
        }

        if (freedBytes > 0) {
          await SystemConfig.findOneAndUpdate(
            { configKey: 'storage' },
            { $inc: { usedBytes: -freedBytes } },
            { upsert: true, session }
          );

          await SystemConfig.updateOne(
            { configKey: 'storage', usedBytes: { $lt: 0 } },
            { $set: { usedBytes: 0 } },
            { session }
          );
        }

        const freshProject = await createFreshStudentProject(
          student._id,
          session,
          targetSupervisor._id
        );

        student.supervisorId = targetSupervisor._id;
        student.projectId = freshProject._id;
        student.status = 'Pending';
        student.remarks = leftTeam
          ? 'You changed supervisor and left your previous team. You are starting fresh under the new supervisor.'
          : 'You changed supervisor and started fresh. Your previous project data was reset.';
        student.projectTitle = '';
        student.projectDesc = '';
        student.domain = '';
        student.domains = [];
        student.tools = '';
        student.pdfUrl = '';

        await student.save({ session });

        return {
          response: NextResponse.json({
            message: leftTeam
              ? 'Supervisor changed. You left your old team and started fresh under the new supervisor.'
              : 'Supervisor changed. Your previous project files were deleted and you started fresh.',
            freedBytes,
          }, { status: 200 }),
        };
        });

        if (result instanceof NextResponse) return result;

        return result.response;
      } catch (error: any) {

        console.error('Supervisor Change Error:', error.message);
        return NextResponse.json({ error: 'Failed to change supervisor.' }, { status: 500 });
      } finally {
        session.endSession();
      }
    }

    // ==========================================
    // ACTION: ASSIGN SUPERVISOR (Transaction Lock)
    // ==========================================
    if (body.action === 'assignSupervisor') {
      return assignStudentSupervisor(req, body);
    }

    // ==========================================
    // HELPER: LEXICAL FINGERPRINT GENERATOR
    // ==========================================
    const generateFingerprint = (title: string) => {
      if (!title) return '';
      const cleanTitle = title.toLowerCase().replace(/[^\w\s]/g, '');
      const stopWords = new Set([
        'a', 'an', 'the', 'for', 'and', 'nor', 'but', 'or', 'yet', 'so', 'of', 'at', 'by', 'from', 'in', 'into', 'on', 'to', 'with', 'using', 'based', 
        'system', 'smart', 'advanced', 'iot', 'project', 'application', 'app', 'web', 'design', 'implementation', 'development'
      ]);
      return cleanTitle.split(/\s+/).filter(word => word.length > 0 && !stopWords.has(word)).sort().join('-');
    };

    // ==========================================
    // ACTION: PROJECT SUBMISSION
    // ==========================================
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token?.id || token.role !== 'student' || String(token.id) !== String(body.id)) {
      return NextResponse.json({ error: 'Unauthorized project submission request.' }, { status: 401 });
    }

    const triggeringStudent = await User.findById(body.id);
    if (!triggeringStudent) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const hasDomainArrayPayload = Object.prototype.hasOwnProperty.call(body, 'domains');
    const legacyDomainText = String(body.domain || '').trim();
    let selectedDomainIds: string[] = [];

    if (hasDomainArrayPayload) {
      const domainValidation = validateProjectDomainIds(body.domains);

      if (!domainValidation.isArray) {
        return NextResponse.json(
          { error: 'Project domains must be submitted as a list.' },
          { status: 400 }
        );
      }

      if (domainValidation.invalid.length > 0) {
        return NextResponse.json(
          {
            error: 'One or more selected project domains are invalid.',
            invalidDomains: domainValidation.invalid,
          },
          { status: 400 }
        );
      }

      if (domainValidation.ids.length === 0) {
        return NextResponse.json(
          { error: 'Select at least one project domain.' },
          { status: 400 }
        );
      }

      selectedDomainIds = domainValidation.ids;
    } else {
      // Transitional support for the current free-text UI.
      // Once the checkbox UI is installed, requests will always use `domains`.
      selectedDomainIds = normalizeProjectDomainIds([], legacyDomainText);

      if (!legacyDomainText && selectedDomainIds.length === 0) {
        return NextResponse.json(
          { error: 'Select at least one project domain.' },
          { status: 400 }
        );
      }
    }

    const normalizedDomainText = formatProjectDomainLabels(
      selectedDomainIds,
      legacyDomainText
    );

    // --- NEW: Dynamic Title Deduplication Engine ---
    const fingerprint = generateFingerprint(body.title);
    
    if (triggeringStudent.projectId) {
      const duplicateProject = await Project.findOne({
        titleFingerprint: fingerprint,
        _id: { $ne: triggeringStudent.projectId }, // Ignore our own current team
        $or: [
          { status: 'Approved' }, // Fully finished projects
          { stage: { $in: PROJECT_STAGES.slice(1) } } // Projects that have already passed the Proposal stage
        ]
      });

      if (duplicateProject) {
        return NextResponse.json(
          { error: 'A project utilizing these core concepts has already been approved for another team. Please select a unique topic.' },
          { status: 409 }
        );
      }
    }
    
    // --- NEW: PDF Exact-Byte Ledger & Orphan Prevention ---
    const oldPdfUrl = triggeringStudent.pdfUrl;
    let sizeDelta = 0;
    
    let targetProject = null;
    if (triggeringStudent.projectId) {
      targetProject = await Project.findById(triggeringStudent.projectId);
    }
    
    if (oldPdfUrl && body.pdfUrl && oldPdfUrl !== body.pdfUrl) {
      try {
        const target = toR2DeletionTarget(oldPdfUrl, targetProject?.pdfSize);
        if (target) await deleteR2Targets([target]);

        // Subtract the exact size of the old PDF being wiped
        sizeDelta -= (targetProject?.pdfSize || 0);
        console.log(`🧹 PDF Orphan Prevention: Wiped old proposal blob -> ${target?.key || oldPdfUrl}`);
      } catch (blobError: any) {
        console.error('Failed to delete old PDF blob:', blobError.message);
      }
    }

    // Add the exact size of the incoming PDF
    if (body.fileSize && body.fileSize > 0) {
      sizeDelta += body.fileSize;
    }

    // Atomically sync the global ledger
    if (sizeDelta !== 0) {
      await SystemConfig.findOneAndUpdate(
        { configKey: 'storage' },
        { $inc: { usedBytes: sizeDelta } },
        { upsert: true }
      );
    }

    const submissionData = {  
      projectTitle: body.title,
      projectDesc: body.desc,
      domain: normalizedDomainText,
      domains: selectedDomainIds,
      tools: body.tools,
      pdfUrl: body.pdfUrl,
      status: 'Submitted For Review'
    };

    let updatedStudent = null;

    if (triggeringStudent.projectId) {
      // Prepare dynamic payload: only update pdfSize if a new file was actually sent
      const projectUpdates: any = {
        title: body.title,
        titleFingerprint: fingerprint,
        domain: normalizedDomainText,
        domains: selectedDomainIds,
        pdfUrl: body.pdfUrl,
        status: 'Submitted For Review',
      };
      if (body.fileSize && body.fileSize > 0) projectUpdates.pdfSize = body.fileSize;

      // OPTIMIZATION: Run Project updates and Team updates in parallel to halve DB response time
      const [_, updatedUsers] = await Promise.all([
        Project.findByIdAndUpdate(triggeringStudent.projectId, { $set: projectUpdates }),
        User.updateMany(
          { projectId: triggeringStudent.projectId },
          { $set: submissionData }
        )
      ]);
      updatedStudent = await User.findById(body.id); // Re-fetch to get supervisor ID
    } else {
      updatedStudent = await User.findByIdAndUpdate(body.id, { $set: submissionData }, { returnDocument: 'after' });
    }

    // Trigger Supervisor Email Notification (Kept identical to prevent UI changes)
    if (updatedStudent && updatedStudent.supervisorId) {
      const supervisor = await User.findById(updatedStudent.supervisorId);
      if (supervisor && supervisor.email && supervisor.notificationsEnabled !== false) {
        const subject = `New FYP Project Submitted: ${updatedStudent.name}`;
        const htmlContent = `
          <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: sans-serif;">
            <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
              <div style="background-color: #18181b; padding: 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 20px;">FYP Portal Notification</h1>
              </div>
              <div style="padding: 32px;">
                <h2 style="margin-top: 0; color: #18181b; font-size: 24px;">New Project Submission</h2>
                <p style="color: #71717a; margin-bottom: 24px;">A new Final Year Project proposal has been submitted.</p>
                <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
                  <p style="margin: 0 0 12px 0;"><strong>Submitted By:</strong> ${updatedStudent.name}</p>
                  <p style="margin: 0 0 12px 0;"><strong>Domains:</strong> ${normalizedDomainText}</p>
                  <p style="margin: 0;"><strong>Title:</strong> ${body.title}</p>
                </div>
              </div>
            </div>
          </div>
        `;
        await sendNotificationEmail(supervisor.email, subject, htmlContent);
      }
    }

    return NextResponse.json({ message: 'Project Submitted!' }, { status: 200 });
  } catch (error) {
    console.error('Student Dashboard API Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
