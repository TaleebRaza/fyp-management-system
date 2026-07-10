import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import mongoose, { ClientSession } from 'mongoose';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import VoiceNote from '../../../../models/VoiceNote';
import { sendNotificationEmail } from '../../../../lib/mailer';
import { APP_SETTINGS, PROGRAM_MAP } from '../../../../config/appSettings';
import { getSupervisorMaxSlots } from '../../../../lib/supervisorSlots';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '../../../../lib/s3-client';
import SystemConfig from '../../../../models/SystemConfig';

export const dynamic = 'force-dynamic';

const PROGRAM_BATCH_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MIN_BATCH_YEAR = 2021;

type DeletionTarget = {
  key: string;
  size: number;
};

function isValidProgram(program: string) {
  return Object.prototype.hasOwnProperty.call(PROGRAM_MAP, program);
}

function isValidBatch(batch: string) {
  const match = /^(Spring|Fall) (20\d{2})$/.exec(batch);
  if (!match) return false;

  const year = Number(match[2]);
  const maxYear = new Date().getFullYear() + 1;

  return year >= MIN_BATCH_YEAR && year <= maxYear;
}

function formatCooldown(ms: number) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.ceil((ms % 3600000) / 60000);

  if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}${minutes > 0 ? ` and ${minutes} minute${minutes === 1 ? '' : 's'}` : ''}`;
  }

  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function getR2ObjectKey(value: string) {
  const trimmedValue = String(value || '').trim();
  if (!trimmedValue) return '';

  try {
    const parsedUrl = new URL(trimmedValue);
    return decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
  } catch {
    return trimmedValue.replace(/^\/+/, '');
  }
}

function buildDeletionTarget(fileUrl: string | undefined, fileSize: number | undefined): DeletionTarget | null {
  const key = getR2ObjectKey(fileUrl || '');
  if (!key) return null;

  return {
    key,
    size: Math.max(Number(fileSize || 0), 0),
  };
}

function mergeDeletionTargets(targets: DeletionTarget[]) {
  const mergedTargets = new Map<string, DeletionTarget>();

  targets.forEach((target) => {
    const existingTarget = mergedTargets.get(target.key);

    mergedTargets.set(target.key, {
      key: target.key,
      size: Math.max(existingTarget?.size || 0, target.size),
    });
  });

  return Array.from(mergedTargets.values());
}

async function createFreshStudentProject(studentId: mongoose.Types.ObjectId, session: ClientSession) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      const newProject = new Project({
        supervisorId: null,
        members: [studentId],
        inviteCode,
        stage: 'PROPOSAL',
        status: 'Pending',
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
    await connectToDatabase();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    
    // OPTIMIZATION: Use .lean() for faster read-only queries
    const student = await User.findById(id).lean();
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    // OPTIMIZATION: Parallel execution. Fetch supervisor and project at the exact same time.
    // Security: only expose the supervisor fields the student dashboard actually needs.
    const [supervisor, project] = await Promise.all([
      student.supervisorId
        ? User.findById(student.supervisorId)
            .select('_id name email broadcastType broadcastContent broadcastSize broadcastCreatedAt')
            .lean()
        : null,
      student.projectId ? Project.findById(student.projectId).populate('members', 'name rollNo email').lean() : null
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

    return NextResponse.json({ student, supervisor, project, supervisorBroadcast }, { status: 200 });
  } catch (error) {
    console.error('Student Dashboard GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const body = await req.json();

        // ==========================================
    // ACTION: STUDENT PROGRAM/BATCH SELF UPDATE
    // ==========================================
    if (body.action === 'updateProgramBatch') {
      const token = (await getToken({ req: req as any, secret: process.env.NEXTAUTH_SECRET })) as any;

      if (!token || token.role !== 'student' || String(token.id) !== String(body.id)) {
        return NextResponse.json({ error: 'Unauthorized Program/Batch update request.' }, { status: 401 });
      }

      const studentId = String(body.id || '').trim();
      const newProgram = String(body.program || '').trim().toUpperCase();
      const newBatch = String(body.batch || '').trim();

      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return NextResponse.json({ error: 'Invalid student account.' }, { status: 400 });
      }

      if (!isValidProgram(newProgram)) {
        return NextResponse.json({ error: 'Invalid program selected.' }, { status: 400 });
      }

      if (!isValidBatch(newBatch)) {
        return NextResponse.json({ error: 'Invalid batch selected.' }, { status: 400 });
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const student = await User.findById(studentId).session(session);

        if (!student || student.role !== 'student') {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
        }

        if (student.program === newProgram && student.batch === newBatch) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'No changes selected. Program and Batch are already the same.' }, { status: 400 });
        }

        if (student.lastProgramBatchChangeAt) {
          const lastChangeTime = new Date(student.lastProgramBatchChangeAt).getTime();
          const timeSinceLastChange = Date.now() - lastChangeTime;

          if (timeSinceLastChange < PROGRAM_BATCH_CHANGE_COOLDOWN_MS) {
            const remainingTime = PROGRAM_BATCH_CHANGE_COOLDOWN_MS - timeSinceLastChange;

            await session.abortTransaction();
            session.endSession();

            return NextResponse.json(
              { error: `You can change Program/Batch once per day. Please try again in ${formatCooldown(remainingTime)}.` },
              { status: 429 }
            );
          }
        }

        const oldProject = student.projectId
          ? await Project.findById(student.projectId).session(session)
          : null;

        let freedBytes = 0;

        if (oldProject) {
          const oldProjectMembers = Array.isArray(oldProject.members) ? oldProject.members : [];
          const isOnlyMember =
            oldProjectMembers.length <= 1 ||
            oldProjectMembers.every((member: any) => String(member) === String(student._id));

          if (isOnlyMember) {
            const voiceNotes = await VoiceNote.find({ projectId: oldProject._id }).session(session);

            const deletionTargets = mergeDeletionTargets([
              buildDeletionTarget(oldProject.pdfUrl, oldProject.pdfSize),
              buildDeletionTarget(student.pdfUrl, oldProject.pdfSize),
              ...voiceNotes
                .map((note: any) => buildDeletionTarget(note.blobUrl, note.fileSize))
                .filter(Boolean),
            ].filter(Boolean) as DeletionTarget[]);

            if (deletionTargets.length > 0) {
              await Promise.all(
                deletionTargets.map((target) =>
                  s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: target.key }))
                )
              );

              freedBytes = deletionTargets.reduce((sum, target) => sum + target.size, 0);
            }

            if (voiceNotes.length > 0) {
              await VoiceNote.deleteMany({
                _id: { $in: voiceNotes.map((note: any) => note._id) },
              }).session(session);
            }

            await Project.findByIdAndDelete(oldProject._id, { session });
          } else {
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

        const newProject = await createFreshStudentProject(student._id, session);

        student.program = newProgram;
        student.batch = newBatch;
        student.supervisorId = null;
        student.projectId = newProject._id;
        student.status = 'Unassigned';
        student.remarks = 'You changed your academic information and accepted the progress reset. Please choose a supervisor again or join a team to begin.';
        student.projectTitle = '';
        student.projectDesc = '';
        student.domain = '';
        student.tools = '';
        student.pdfUrl = '';
        student.lastProgramBatchChangeAt = new Date();

        await student.save({ session });

        await session.commitTransaction();
        session.endSession();

        return NextResponse.json(
          {
            message: 'Program and Batch updated successfully. Your dashboard has been reset.',
            freedBytes,
          },
          { status: 200 }
        );
      } catch (error: any) {
        await session.abortTransaction();
        session.endSession();

        console.error('Program/Batch Update Error:', error.message);
        return NextResponse.json({ error: 'Failed to update Program/Batch.' }, { status: 500 });
      }
    }

    // ==========================================
    // ACTION: ASSIGN SUPERVISOR (Transaction Lock)
    // ==========================================
    if (body.action === 'assignSupervisor') {
      // 1. Start an Atomic Transaction Session to prevent race conditions
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const supervisor = await User.findOne({ _id: body.supervisorId, role: 'supervisor' })
          .select('_id extraSlots')
          .session(session);

        if (!supervisor) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'Selected supervisor was not found.' }, { status: 404 });
        }

        let filledSlots = 0;
        // 2. Count current slots WITH the session lock
        if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'STUDENT') {
          filledSlots = await User.countDocuments({ role: 'student', supervisorId: body.supervisorId }).session(session);
        } else if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'PROJECT') {
          filledSlots = await Project.countDocuments({ supervisorId: body.supervisorId }).session(session);
        }

        const maxSlots = getSupervisorMaxSlots(supervisor);

        // 3. Strict Capacity Enforcement
        if (filledSlots >= maxSlots) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json(
            { error: `Cannot assign. The selected supervisor has reached maximum capacity (${maxSlots} slots).` }, 
            { status: 409 } // 409 Conflict is the correct HTTP status for a race condition rejection
          );
        }

        const triggeringStudent = await User.findById(body.id).session(session);
        if (!triggeringStudent) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

        const supObjectId = new mongoose.Types.ObjectId(body.supervisorId);

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
    const triggeringStudent = await User.findById(body.id);
    if (!triggeringStudent) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    // --- NEW: Dynamic Title Deduplication Engine ---
    const fingerprint = generateFingerprint(body.title);
    
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
    
    // --- NEW: PDF Exact-Byte Ledger & Orphan Prevention ---
    const oldPdfUrl = triggeringStudent.pdfUrl;
    let sizeDelta = 0;
    
    let targetProject = null;
    if (triggeringStudent.projectId) {
      targetProject = await Project.findById(triggeringStudent.projectId);
    }
    
    if (oldPdfUrl && body.pdfUrl && oldPdfUrl !== body.pdfUrl) {
      try {
        let keyToDelete = oldPdfUrl;
        if (keyToDelete.includes('.com/')) keyToDelete = keyToDelete.split('.com/')[1];
        
        await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: keyToDelete }));
        
        // Subtract the exact size of the old PDF being wiped
        sizeDelta -= (targetProject?.pdfSize || 0);
        console.log(`🧹 PDF Orphan Prevention: Wiped old proposal blob -> ${keyToDelete}`);
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
      domain: body.domain,
      tools: body.tools,
      pdfUrl: body.pdfUrl,
      status: 'Submitted For Review'
    };

    let updatedStudent = null;

    if (triggeringStudent.projectId) {
      // Prepare dynamic payload: only update pdfSize if a new file was actually sent
      const projectUpdates: any = { title: body.title, titleFingerprint: fingerprint, domain: body.domain, pdfUrl: body.pdfUrl };
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
                  <p style="margin: 0 0 12px 0;"><strong>Domain:</strong> ${body.domain}</p>
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