import { NextRequest, NextResponse } from 'next/server';
import mongoose, { ClientSession } from 'mongoose';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import VoiceNote from '../../../../models/VoiceNote';
import { sendNotificationEmail } from '../../../../lib/mailer';
import { PROGRAM_MAP } from '../../../../config/appSettings';
import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '../../../../lib/s3-client';
import SystemConfig from '../../../../models/SystemConfig';
import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
  validateProjectDomainIds,
} from '../../../../config/projectDomains';

import { buildFineRestriction, FINE_RESTRICTION_CODE } from '../../../../lib/fineRestriction';
import {
  getTeamFineRestriction,
  getTeamFineRestrictionMessage,
} from '../../../../lib/teamFineRestriction';
import { getOrCreateRegistrationPolicy, serializeRegistrationPolicy } from '../../../../lib/registrationPolicy';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { createInviteCode } from '../../../../lib/security/inviteCode';
import { escapeHtml, isRecord, normalizeText } from '../../../../lib/security/input';
import {
  capacityReservationError,
  releaseSupervisorProjectSlot,
  reserveSupervisorProjectSlot,
} from '../../../../lib/supervisorCapacity';

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

    await connectToDatabase();

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
    let fineRestrictionResponse: NonNullable<ReturnType<typeof buildFineRestriction>> & {
      payment: ReturnType<typeof serializeRegistrationPolicy>['finePayment'];
    } | null = null;
    if (fineRestriction) {
      const policy = serializeRegistrationPolicy(await getOrCreateRegistrationPolicy());
      fineRestrictionResponse = {
        ...fineRestriction,
        payment: policy.finePayment,
      };
    }

    // Fetch dashboard relationships and the team restriction in parallel.
    const [supervisor, project, teamFineRestriction] = await Promise.all([
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
    getTeamFineRestriction(student.projectId, student._id),
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
            oldProjectMembers.every((member: unknown) => String(member) === String(student._id));

          if (isOnlyMember) {
            const voiceNotes = await VoiceNote.find({ projectId: oldProject._id }).session(session);

            const deletionTargets = mergeDeletionTargets([
              buildDeletionTarget(oldProject.pdfUrl, oldProject.pdfSize),
              buildDeletionTarget(student.pdfUrl, oldProject.pdfSize),
              ...voiceNotes
                .map((note) => buildDeletionTarget(note.blobUrl, note.fileSize))
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
                _id: { $in: voiceNotes.map((note) => note._id) },
              }).session(session);
            }

            if (oldProject.supervisorId && !await releaseSupervisorProjectSlot(oldProject.supervisorId, session)) {
              throw new Error('Unable to release the previous supervisor capacity.');
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
        student.domains = [];
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
      } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error('Program/Batch Update Error:', error instanceof Error ? error.message : error);
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

      let deletionTargets: DeletionTarget[] = [];
      let freedBytes = 0;
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
            const voiceNotes = await VoiceNote.find({ projectId: oldProject._id }).session(session);

            deletionTargets = mergeDeletionTargets([
              buildDeletionTarget(oldProject.pdfUrl, oldProject.pdfSize),
              String(student.pdfUrl || '') !== String(oldProject.pdfUrl || '')
                ? buildDeletionTarget(student.pdfUrl, oldProject.pdfSize)
                : null,
              ...voiceNotes
                .map((note) => buildDeletionTarget(note.blobUrl, note.fileSize))
                .filter(Boolean),
            ].filter(Boolean) as DeletionTarget[]);

            freedBytes = deletionTargets.reduce((sum, target) => sum + target.size, 0);

            if (voiceNotes.length > 0) {
              await VoiceNote.deleteMany({
                _id: { $in: voiceNotes.map((note) => note._id) },
              }).session(session);
            }

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

        await session.commitTransaction();
        session.endSession();

        if (deletionTargets.length > 0) {
          Promise.all(
            deletionTargets.map((target) =>
              s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: target.key }))
            )
          ).catch((error: unknown) => {
            console.error('Supervisor change file cleanup failed:', error instanceof Error ? error.message : error);
          });
        }

        return NextResponse.json(
          {
            message: leftTeam
              ? 'Supervisor changed. You left your old team and started fresh under the new supervisor.'
              : 'Supervisor changed. Your previous project files were deleted and you started fresh.',
            freedBytes,
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
  if (submissionTeamFineRestriction) {
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
    
    // Use storage metadata, not browser metadata, for a newly supplied PDF.
    const oldPdfUrl = triggeringStudent.pdfUrl;
    let sizeDelta = 0;
    const isNewPdf = pdfUrl !== oldPdfUrl;
    let uploadedPdfSize = 0;

    if (isNewPdf) {
      const uploadedKey = getR2ObjectKey(pdfUrl);
      if (!uploadedKey.startsWith(`proposals/${submissionStudentId}/`)) {
        return NextResponse.json({ error: 'Invalid uploaded PDF.' }, { status: 400 });
      }

      try {
        const uploadedObject = await s3Client.send(
          new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: uploadedKey })
        );
        uploadedPdfSize = Number(uploadedObject.ContentLength || 0);
        if (uploadedPdfSize <= 0 || uploadedPdfSize > 4 * 1024 * 1024 || !uploadedObject.ContentType?.startsWith('application/pdf')) {
          await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: uploadedKey }));
          return NextResponse.json({ error: 'Uploaded PDF is invalid.' }, { status: 400 });
        }
      } catch (error) {
        console.error('Uploaded PDF verification failed:', error);
        return NextResponse.json({ error: 'Uploaded PDF could not be verified.' }, { status: 400 });
      }
    }
    
    let targetProject = null;
    if (triggeringStudent.projectId) {
      targetProject = await Project.findById(triggeringStudent.projectId);
    }
    
    if (oldPdfUrl && oldPdfUrl !== pdfUrl) {
      try {
        let keyToDelete = oldPdfUrl;
        if (keyToDelete.includes('.com/')) keyToDelete = keyToDelete.split('.com/')[1];
        
        await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: keyToDelete }));
        
        // Subtract the exact size of the old PDF being wiped
        sizeDelta -= (targetProject?.pdfSize || 0);
        console.log(`🧹 PDF Orphan Prevention: Wiped old proposal blob -> ${keyToDelete}`);
      } catch (blobError) {
        console.error('Failed to delete old PDF blob:', blobError instanceof Error ? blobError.message : blobError);
      }
    }

    if (isNewPdf) sizeDelta += uploadedPdfSize;

    // Atomically sync the global ledger
    if (sizeDelta !== 0) {
      await SystemConfig.findOneAndUpdate(
        { configKey: 'storage' },
        { $inc: { usedBytes: sizeDelta } },
        { upsert: true }
      );
    }

    const submissionData = {  
      projectTitle: title,
      projectDesc: description,
      domain: normalizedDomainText,
      domains: selectedDomainIds,
      tools,
      pdfUrl,
      status: 'Submitted For Review'
    };

    let updatedStudent = null;

    if (triggeringStudent.projectId) {
      // Prepare dynamic payload: only update pdfSize if a new file was actually sent
      const projectUpdates: Record<string, unknown> = {
        title,
        titleFingerprint: fingerprint,
        domain: normalizedDomainText,
        domains: selectedDomainIds,
        pdfUrl,
        status: 'Submitted For Review',
      };
      if (isNewPdf) projectUpdates.pdfSize = uploadedPdfSize;

      // OPTIMIZATION: Run Project updates and Team updates in parallel to halve DB response time
      await Promise.all([
        Project.findByIdAndUpdate(triggeringStudent.projectId, { $set: projectUpdates }),
        User.updateMany(
          { projectId: triggeringStudent.projectId },
          { $set: submissionData }
        )
      ]);
      updatedStudent = await User.findById(triggeringStudent._id); // Re-fetch to get supervisor ID
    } else {
      updatedStudent = await User.findByIdAndUpdate(triggeringStudent._id, { $set: submissionData }, { returnDocument: 'after' });
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
                  <p style="margin: 0 0 12px 0;"><strong>Submitted By:</strong> ${escapeHtml(updatedStudent.name)}</p>
                  <p style="margin: 0 0 12px 0;"><strong>Domains:</strong> ${escapeHtml(normalizedDomainText)}</p>
                  <p style="margin: 0;"><strong>Title:</strong> ${escapeHtml(title)}</p>
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
