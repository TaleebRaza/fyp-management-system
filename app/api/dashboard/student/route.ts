import { NextRequest, NextResponse } from 'next/server';
import mongoose, { ClientSession } from 'mongoose';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import RegistrationPolicy from '../../../../models/RegistrationPolicy';
import { enqueueNotificationEmail } from '../../../../lib/emailOutbox';
import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
  validateProjectDomainIds,
} from '../../../../config/projectDomains';

import {
  buildFineRestriction,
  FINE_RESTRICTION_CODE,
  isFineRestrictionBlocking,
} from '../../../../lib/fineRestriction';
import {
  getTeamFineRestriction,
  getTeamFineRestrictionFromMembers,
  getTeamFineRestrictionMessage,
} from '../../../../lib/teamFineRestriction';
import {
  REGISTRATION_POLICY_KEY,
  getOrCreateRegistrationPolicy,
  serializeRegistrationPolicy,
} from '../../../../lib/registrationPolicy';
import {
  areProjectSubmissionsOpen,
  PROJECT_SUBMISSIONS_CLOSED_CODE,
  PROJECT_SUBMISSIONS_CLOSED_MESSAGE,
} from '../../../../lib/projectSubmissionPolicy';
import { AcademicResetError, resetStudentAcademicInfo } from '../../../../lib/academicReset';
import { enqueueDeletedProjectStorage } from '../../../../lib/projectStorageCleanup';
import { findSharedStorageKeys } from '../../../../lib/storageReferenceSafety';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { createInviteCode } from '../../../../lib/security/inviteCode';
import { escapeHtml, isRecord, normalizeText } from '../../../../lib/security/input';
import { normalizeStorageKey } from '../../../../lib/security/storage';
import {
  capacityReservationError,
  releaseSupervisorProjectSlot,
  reserveSupervisorProjectSlot,
} from '../../../../lib/supervisorCapacity';
import {
  enqueueStorageDeletion,
  finalizeUploadReservation,
  StorageProtocolError,
} from '../../../../lib/storageProtocol';

export const dynamic = 'force-dynamic';

async function createFreshStudentProject(
  studentId: mongoose.Types.ObjectId,
  session: ClientSession,
  supervisorId: mongoose.Types.ObjectId | null = null
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const inviteCode = createInviteCode();

      const newProject = new Project({
        supervisorId,
        members: [studentId],
        inviteCode,
        stage: 'PROPOSAL',
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
    } catch (error) {
      if ((error as { code?: unknown }).code !== 11000) throw error;
    }
  }

  throw new Error('Failed to generate a unique project invite code.');
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req, ['student']);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized student request.' }, { status: 401 });
    }

    const studentId = currentUser.id;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return NextResponse.json({ error: 'Invalid student account.' }, { status: 400 });
    }

    // Use the authenticated student's ID and return only dashboard-safe fields.
    const student = await User.findOne({ _id: studentId, role: 'student' })
      .select(
        '_id name email rollNo role program batch semester supervisorId status remarks projectTitle pdfUrl projectDesc domain domains tools notificationsEnabled isActive projectId lateRegistrationDays lateRegistrationFine lateRegistrationFineStatus lateRegistrationFineResolvedAt registrationPunishment'
      )
      .lean();

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const fineRestriction = buildFineRestriction(student);

    // Fetch independent dashboard relationships in parallel.
    const [supervisor, project, policyDocument] = await Promise.all([
      student.supervisorId
        ? User.findById(student.supervisorId)
            .select('_id name email broadcastType broadcastContent broadcastSize broadcastCreatedAt')
            .lean()
        : null,
      student.projectId
        ? Project.findById(student.projectId)
            .select('_id members status stage domain domains pdfUrl inviteCode maxTeamSize')
            .lean()
        : null,
      getOrCreateRegistrationPolicy(),
    ]);

    const projectMembers = project?.members?.length
      ? await User.find({ _id: { $in: project.members }, role: 'student' })
          .select('_id name rollNo email lateRegistrationDays lateRegistrationFine lateRegistrationFineStatus registrationPunishment')
          .lean()
      : [];
    const teamFineRestriction = getTeamFineRestrictionFromMembers(projectMembers, student._id);
    const policy = serializeRegistrationPolicy(policyDocument);
    const fineRestrictionResponse = fineRestriction
      ? { ...fineRestriction, payment: policy.finePayment }
      : null;
    const safeProjectMembers = projectMembers.map((member) => ({
      _id: member._id,
      name: member.name,
      rollNo: member.rollNo,
      email: member.email,
    }));

    const supervisorBroadcast = supervisor?.broadcastType && supervisor?.broadcastContent
      ? {
          type: supervisor.broadcastType,
          content: supervisor.broadcastContent,
          size: supervisor.broadcastSize || 0,
          createdAt: supervisor.broadcastCreatedAt || null,
          supervisorName: supervisor.name || 'Supervisor',
        }
      : null;

    const projectRecord = project as { domains?: unknown; domain?: unknown } | null;
    const studentRecord = student as { domains?: unknown; domain?: unknown };
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
      lateRegistrationDays: fineRestriction?.lateRegistrationFine?.daysLate || 0,
      lateRegistrationFine: fineRestriction?.lateRegistrationFine?.amount || 0,
      domains: normalizedDomains,
      domain: normalizedDomainText,
    };

    const projectResponse = projectRecord
      ? {
          ...projectRecord,
          members: safeProjectMembers,
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
        fineRestriction: fineRestrictionResponse,
        teamFineRestriction,
        fineRestrictions: fineRestriction || teamFineRestriction ? policy.fineRestrictions : undefined,
        projectSubmissionsOpen: policy.projectSubmissionsOpen,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  } catch (error) {
    console.error('Student Dashboard GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req, ['student']);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized student request.' }, { status: 401 });
    }

    await connectToDatabase();
    const body: unknown = await req.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: 'Invalid student action.' }, { status: 400 });
    }
    const action = body.action;
    if (!['updateProgramBatch', 'changeSupervisor', 'assignSupervisor', 'submitProject'].includes(String(action))) {
      return NextResponse.json({ error: 'Unknown student action.' }, { status: 400 });
    }

        // ==========================================
    // ACTION: STUDENT PROGRAM/BATCH SELF UPDATE
    // ==========================================
    if (action === 'updateProgramBatch') {
      if (String(currentUser.id) !== String(body.id)) {
        return NextResponse.json({ error: 'Unauthorized Program/Batch update request.' }, { status: 401 });
      }

      try {
        const result = await resetStudentAcademicInfo({
          targetUserId: String(body.id || '').trim(),
          newProgram: typeof body.program === 'string' ? body.program : undefined,
          newBatch: typeof body.batch === 'string' ? body.batch : undefined,
          actor: 'student',
          enforceStudentCooldown: true,
        });
        return NextResponse.json(result, { status: 200 });
      } catch (error) {
        if (error instanceof AcademicResetError) {
          return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }
        console.error('student_academic_reset_failed');
        return NextResponse.json({ error: 'Failed to update Program/Batch.' }, { status: 500 });
      }
    }

    // ==========================================
    // ACTION: CHANGE SUPERVISOR (student starts fresh)
    // ==========================================
    if (action === 'changeSupervisor') {
      if (String(currentUser.id) !== String(body.id)) {
        return NextResponse.json({ error: 'Unauthorized supervisor change request.' }, { status: 401 });
      }

      const studentId = String(body.id || '').trim();
      const newSupervisorId = String(body.supervisorId || '').trim();

      if (!mongoose.Types.ObjectId.isValid(studentId) || !mongoose.Types.ObjectId.isValid(newSupervisorId)) {
        return NextResponse.json({ error: 'Invalid student or supervisor.' }, { status: 400 });
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      let queuedDeletionBytes = 0;
      let leftTeam = false;

      try {
        const student = await User.findById(studentId).session(session);

        if (!student || student.role !== 'student') {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
        }

        if (String(student.supervisorId || '') === newSupervisorId) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'You are already assigned to this supervisor.' }, { status: 400 });
        }

        const targetSupervisor = await User.findOne({
          _id: newSupervisorId,
          role: 'supervisor',
        })
          .select('_id name')
          .session(session);

        if (!targetSupervisor) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'Selected supervisor was not found.' }, { status: 404 });
        }

        const reservation = await reserveSupervisorProjectSlot(targetSupervisor._id, session);
        if (reservation !== 'reserved') {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: capacityReservationError(reservation) }, { status: reservation === 'missing' ? 404 : 409 });
        }

        const oldProject = student.projectId
          ? await Project.findById(student.projectId).session(session)
          : null;

        if (oldProject) {
          const projectIsLocked = oldProject.status === 'Approved' || oldProject.stage !== 'PROPOSAL';

          if (projectIsLocked) {
            await session.abortTransaction();
            session.endSession();

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
            oldProjectMembers.every((member: unknown) => String(member) === String(student._id));

          if (isOnlyMember) {
            const cleanup = await enqueueDeletedProjectStorage({
              project: oldProject,
              extraPdfUrls: [student.pdfUrl],
              reason: 'supervisor-change',
              session,
            });
            queuedDeletionBytes = cleanup.queuedDeletionBytes;

            if (oldProject.supervisorId && !await releaseSupervisorProjectSlot(oldProject.supervisorId, session)) {
              throw new Error('Unable to release the previous supervisor capacity.');
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

        await session.commitTransaction();
        session.endSession();

        return NextResponse.json(
          {
            message: leftTeam
              ? 'Supervisor changed. You left your old team and started fresh under the new supervisor.'
              : 'Supervisor changed. Your previous project files are queued for deletion.',
            queuedDeletionBytes,
          },
          { status: 200 }
        );
      } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error('Supervisor Change Error:', error instanceof Error ? error.message : error);
        return NextResponse.json({ error: 'Failed to change supervisor.' }, { status: 500 });
      }
    }

    // ==========================================
    // ACTION: ASSIGN SUPERVISOR (Transaction Lock)
    // ==========================================
    if (action === 'assignSupervisor') {
      if (String(currentUser.id) !== String(body.id)) {
        return NextResponse.json({ error: 'Unauthorized supervisor assignment request.' }, { status: 401 });
      }

      if (!mongoose.Types.ObjectId.isValid(String(body.id || '')) || !mongoose.Types.ObjectId.isValid(String(body.supervisorId || ''))) {
        return NextResponse.json({ error: 'Invalid student or supervisor.' }, { status: 400 });
      }

      // 1. Start an Atomic Transaction Session to prevent race conditions
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const triggeringStudent = await User.findById(body.id).session(session);
        if (!triggeringStudent) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

        if (triggeringStudent.supervisorId && triggeringStudent.status !== 'Unassigned') {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json(
            { error: 'You already have a supervisor. Use the change supervisor option instead.' },
            { status: 400 }
          );
        }

        const supervisor = await User.findOne({ _id: body.supervisorId, role: 'supervisor' })
          .select('_id')
          .session(session);

        if (!supervisor) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'Selected supervisor was not found.' }, { status: 404 });
        }

        const reservation = await reserveSupervisorProjectSlot(supervisor._id, session);
        if (reservation !== 'reserved') {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: capacityReservationError(reservation) }, { status: reservation === 'missing' ? 404 : 409 });
        }

        const supObjectId = new mongoose.Types.ObjectId(supervisor._id);

        // 4. Update Project and Team Members inside the locked session
        if (triggeringStudent.projectId) {
          await Project.findByIdAndUpdate(
            triggeringStudent.projectId, 
            { $set: { supervisorId: supObjectId } },
            { session }
          );

          await User.updateMany(
            { projectId: triggeringStudent.projectId },
            { $set: { supervisorId: supObjectId, status: 'Pending', remarks: '' } },
            { session }
          );
        } else {
          await User.findByIdAndUpdate(
            body.id, 
            { $set: { supervisorId: supObjectId, status: 'Pending', remarks: '' } },
            { session }
          );
        }

        // 5. Commit the transaction ONLY if no other request modified the count during our process
        await session.commitTransaction();
        session.endSession();
        return NextResponse.json({ message: 'Supervisor successfully assigned to your team!' }, { status: 200 });

      } catch (transactionError) {
        // Safe Fallback: Abort all changes if anything fails
        await session.abortTransaction();
        session.endSession();
        throw transactionError; 
      }
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
    const submissionStudentId = currentUser.id;
    if (!mongoose.Types.ObjectId.isValid(submissionStudentId)) {
      return NextResponse.json({ error: 'Unauthorized student submission.' }, { status: 401 });
    }

    const triggeringStudent = await User.findOne({
      _id: submissionStudentId,
      role: 'student',
    });
    if (!triggeringStudent) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const submissionPolicy = serializeRegistrationPolicy(await getOrCreateRegistrationPolicy());
    if (!areProjectSubmissionsOpen(submissionPolicy)) {
      return NextResponse.json(
        { code: PROJECT_SUBMISSIONS_CLOSED_CODE, error: PROJECT_SUBMISSIONS_CLOSED_MESSAGE },
        { status: 403 }
      );
    }

    const title = normalizeText(body.title, 200);
    const description = normalizeText(body.desc, 2_000);
    const tools = normalizeText(body.tools, 1_000);
    const pdfUrl = typeof body.pdfUrl === 'string' ? body.pdfUrl.trim() : '';
    if (!title || !description || !tools || !pdfUrl) {
      return NextResponse.json({ error: 'Title, description, tools, and a PDF are required.' }, { status: 400 });
    }

    const submissionFineRestriction = buildFineRestriction(triggeringStudent);
    const submissionTeamFineRestriction = await getTeamFineRestriction(
      triggeringStudent.projectId,
      triggeringStudent._id
    );
    const fineRestrictions = submissionTeamFineRestriction
      ? serializeRegistrationPolicy(await getOrCreateRegistrationPolicy()).fineRestrictions
      : null;
    if (
      submissionTeamFineRestriction &&
      isFineRestrictionBlocking(
        submissionTeamFineRestriction,
        fineRestrictions?.proposalUpload
      )
    ) {
      return NextResponse.json(
        {
          code: FINE_RESTRICTION_CODE,
          error: getTeamFineRestrictionMessage(submissionTeamFineRestriction, 'submission'),
          fineRestriction: submissionFineRestriction,
          teamFineRestriction: submissionTeamFineRestriction,
        },
        { status: 403 }
      );
    }

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
    const fingerprint = generateFingerprint(title);
    
    if (triggeringStudent.projectId) {
      const duplicateProject = await Project.findOne({
        titleFingerprint: fingerprint,
        _id: { $ne: triggeringStudent.projectId }, // Ignore our own current team
        $or: [
          { status: 'Approved' }, // Fully finished projects
          { stage: { $in: ['THESIS_DRAFT', 'FINAL_DELIVERABLES'] } } // Projects that have already passed the Proposal stage
        ]
      });

      if (duplicateProject) {
        return NextResponse.json(
          { error: 'A project utilizing these core concepts has already been approved for another team. Please select a unique topic.' },
          { status: 409 }
        );
      }
    }
    
    const uploadedKey = normalizeStorageKey(pdfUrl);
    if (!uploadedKey || !uploadedKey.startsWith(`proposals/${submissionStudentId}/`)) {
      return NextResponse.json({ error: 'Invalid uploaded PDF.' }, { status: 400 });
    }

    await finalizeUploadReservation({
      key: uploadedKey,
      ownerId: submissionStudentId,
      kind: 'pdf',
      commit: async (session, uploadedObject) => {
        const acceptedSubmissionPolicy = await RegistrationPolicy.findOneAndUpdate(
          {
            policyKey: REGISTRATION_POLICY_KEY,
            projectSubmissionsOpen: { $ne: false },
          },
          { $inc: { projectSubmissionsAccepted: 1 } },
          { new: true, session }
        );
        if (!acceptedSubmissionPolicy) {
          throw new StorageProtocolError(PROJECT_SUBMISSIONS_CLOSED_MESSAGE, 403);
        }

        const studentInTransaction = await User.findOne({
          _id: submissionStudentId,
          role: 'student',
        }).session(session);
        if (!studentInTransaction?.projectId) {
          throw new StorageProtocolError('Project record not found for this student.', 409);
        }

        const project = await Project.findOne({
          _id: studentInTransaction.projectId,
          members: studentInTransaction._id,
        }).session(session);
        if (!project) throw new StorageProtocolError('Project membership changed. Refresh and try again.', 409);

        const oldPdfKey = normalizeStorageKey(project.pdfUrl);
        if (project.pdfUrl && !oldPdfKey) {
          throw new StorageProtocolError(
            'The current project file key is invalid. Run the storage integrity audit before replacing it.',
            409
          );
        }
        const updatedProject = await Project.updateOne(
          {
            _id: project._id,
            members: studentInTransaction._id,
            $or: [{ version: Number(project.version || 0) }, { version: { $exists: false } }],
          },
          {
            $set: {
              title,
              titleFingerprint: fingerprint,
              domain: normalizedDomainText,
              domains: selectedDomainIds,
              pdfUrl: uploadedKey,
              pdfSize: uploadedObject.actualBytes,
              status: 'Submitted For Review',
            },
            $inc: { version: 1 },
          },
          { session }
        );
        if (updatedProject.modifiedCount !== 1) {
          throw new StorageProtocolError('Project changed while submitting. Refresh and try again.', 409);
        }

        await User.updateMany(
          { projectId: project._id, role: 'student' },
          {
            $set: {
              projectTitle: title,
              projectDesc: description,
              domain: normalizedDomainText,
              domains: selectedDomainIds,
              tools,
              pdfUrl: uploadedKey,
              status: 'Submitted For Review',
            },
          },
          { session }
        );

        if (oldPdfKey && oldPdfKey !== uploadedKey) {
          const sharedKeys = await findSharedStorageKeys({
            keys: [oldPdfKey],
            excludedProjectIds: [project._id],
            session,
          });
          const isShared = sharedKeys.has(oldPdfKey);
          if (!isShared) {
            await enqueueStorageDeletion(
              { key: oldPdfKey, bytes: Number(project.pdfSize || 0), reason: 'project-pdf-replaced' },
              session
            );
          }
        }

        const supervisorId = project.supervisorId || studentInTransaction.supervisorId;
        const supervisor = supervisorId
          ? await User.findOne({ _id: supervisorId, role: 'supervisor' })
              .select('email notificationsEnabled')
              .session(session)
              .lean()
          : null;
        if (supervisor?.email && supervisor.notificationsEnabled !== false) {
          await enqueueNotificationEmail({
            dedupeKey: `project-submission:${project._id}:${uploadedKey}`,
            to: supervisor.email,
            subject: `New FYP Project Submitted: ${studentInTransaction.name}`,
            html: `
              <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: sans-serif;">
                <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
                  <div style="background-color: #18181b; padding: 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 20px;">FYP Portal Notification</h1>
                  </div>
                  <div style="padding: 32px;">
                    <h2 style="margin-top: 0; color: #18181b; font-size: 24px;">New Project Submission</h2>
                    <p style="color: #71717a; margin-bottom: 24px;">A new Final Year Project proposal has been submitted.</p>
                    <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
                      <p style="margin: 0 0 12px 0;"><strong>Submitted By:</strong> ${escapeHtml(studentInTransaction.name)}</p>
                      <p style="margin: 0 0 12px 0;"><strong>Domains:</strong> ${escapeHtml(normalizedDomainText)}</p>
                      <p style="margin: 0;"><strong>Title:</strong> ${escapeHtml(title)}</p>
                    </div>
                  </div>
                </div>
              </div>`,
          }, session);
        }

        return true;
      },
    });

    return NextResponse.json({ message: 'Project Submitted!' }, { status: 200 });
  } catch (error) {
    console.error('student_dashboard_submission_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
