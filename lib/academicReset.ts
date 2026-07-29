import mongoose, { ClientSession } from 'mongoose';
import { createInviteCode } from './security/inviteCode';

import connectToDatabase from './mongodb';
import { PROGRAM_MAP } from '../config/appSettings';

import User from '../models/User';
import Project from '../models/Project';
import VoiceNote from '../models/VoiceNote';
import { releaseSupervisorProjectSlot } from './supervisorCapacity';
import { normalizeStorageKey } from './security/storage';
import { enqueueStorageDeletion } from './storageProtocol';

const PROGRAM_BATCH_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MIN_BATCH_YEAR = 2021;

const ADMIN_ACADEMIC_RESET_MESSAGE =
  'Your academic information was updated by an Admin. Please choose a supervisor again or join a team to begin.';

const STUDENT_SELF_ACADEMIC_RESET_MESSAGE =
  'You changed your academic information and accepted the progress reset. Please choose a supervisor again or join a team to begin.';

type AcademicResetActor = 'admin' | 'student';

type DeletionTarget = {
  key: string;
  size: number;
};

type ResetStudentAcademicInfoParams = {
  targetUserId: string;
  newProgram?: string;
  newBatch?: string;
  actor: AcademicResetActor;
  enforceStudentCooldown?: boolean;
};

export class AcademicResetError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'AcademicResetError';
    this.statusCode = statusCode;
  }
}

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

function buildDeletionTarget(fileUrl: string | undefined, fileSize: number | undefined): DeletionTarget | null {
  const key = normalizeStorageKey(fileUrl || '');
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
      const inviteCode = createInviteCode();

      const newProject = new Project({
        supervisorId: null,
        members: [studentId],
        inviteCode,
        title: '',
        titleFingerprint: '',
        domain: '',
        pdfUrl: '',
        pdfSize: 0,
        status: 'Pending',
        maxTeamSize: 2,
        stage: 'PROPOSAL',
      });

      await newProject.save({ session });
      return newProject;
    } catch (error) {
      if ((error as { code?: unknown })?.code !== 11000) throw error;
    }
  }

  throw new Error('Failed to generate a unique project invite code.');
}

export async function resetStudentAcademicInfo({
  targetUserId,
  newProgram,
  newBatch,
  actor,
  enforceStudentCooldown = false,
}: ResetStudentAcademicInfoParams) {
  await connectToDatabase();

  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    throw new AcademicResetError('Invalid student account.', 400);
  }

  const providedProgram = typeof newProgram === 'string' && newProgram.trim().length > 0;
  const providedBatch = typeof newBatch === 'string' && newBatch.trim().length > 0;

  if (!providedProgram && !providedBatch) {
    throw new AcademicResetError('Program or Batch is required.', 400);
  }

  const mongoSession = await mongoose.startSession();

  try {
    return await mongoSession.withTransaction(async () => {
    const student = await User.findById(targetUserId).session(mongoSession);

    if (!student || student.role !== 'student') {
      throw new AcademicResetError('Student not found.', 404);
    }

    const currentProgram = String(student.program || '').trim().toUpperCase();
    const currentBatch = String(student.batch || '').trim();

    const finalProgram = providedProgram ? String(newProgram).trim().toUpperCase() : currentProgram;
    const finalBatch = providedBatch ? String(newBatch).trim() : currentBatch;

    if (providedProgram && !isValidProgram(finalProgram)) {
      throw new AcademicResetError('Invalid program selected.', 400);
    }

    if (providedBatch && !isValidBatch(finalBatch)) {
      throw new AcademicResetError('Invalid batch selected.', 400);
    }

    const programChanged = providedProgram && finalProgram !== currentProgram;
    const batchChanged = providedBatch && finalBatch !== currentBatch;

    if (!programChanged && !batchChanged) {
      throw new AcademicResetError('No changes selected. Academic information is already the same.', 400);
    }

    if (actor === 'student' && enforceStudentCooldown && student.lastProgramBatchChangeAt) {
      const lastChangeTime = new Date(student.lastProgramBatchChangeAt).getTime();
      const timeSinceLastChange = Date.now() - lastChangeTime;

      if (timeSinceLastChange < PROGRAM_BATCH_CHANGE_COOLDOWN_MS) {
        const remainingTime = PROGRAM_BATCH_CHANGE_COOLDOWN_MS - timeSinceLastChange;

        throw new AcademicResetError(
          `You can change Program/Batch once per day. Please try again in ${formatCooldown(remainingTime)}.`,
          429
        );
      }
    }

    const oldProject = student.projectId
      ? await Project.findById(student.projectId).session(mongoSession)
      : null;

    let queuedDeletionBytes = 0;

    if (oldProject) {
      const oldProjectMembers = Array.isArray(oldProject.members) ? oldProject.members : [];

      const isOnlyMember =
        oldProjectMembers.length <= 1 ||
        oldProjectMembers.every((member: unknown) => String(member) === String(student._id));

      if (isOnlyMember) {
        const voiceNotes = await VoiceNote.find({ projectId: oldProject._id }).session(mongoSession);

        const deletionTargets = mergeDeletionTargets([
          buildDeletionTarget(oldProject.pdfUrl, oldProject.pdfSize),
          buildDeletionTarget(student.pdfUrl, oldProject.pdfSize),
          ...voiceNotes
            .map((note) => buildDeletionTarget(note.blobUrl, note.fileSize))
            .filter(Boolean),
        ].filter(Boolean) as DeletionTarget[]);

        for (const target of deletionTargets) {
          await enqueueStorageDeletion(
            { key: target.key, bytes: target.size, reason: 'academic-reset' },
            mongoSession
          );
          queuedDeletionBytes += target.size;
        }

        if (voiceNotes.length > 0) {
          await VoiceNote.deleteMany({
            _id: { $in: voiceNotes.map((note) => note._id) },
          }).session(mongoSession);
        }

        if (oldProject.supervisorId && !await releaseSupervisorProjectSlot(oldProject.supervisorId, mongoSession)) {
          throw new AcademicResetError('Unable to release the previous supervisor capacity.', 409);
        }
        await Project.findByIdAndDelete(oldProject._id, { session: mongoSession });
      } else {
        await Project.findByIdAndUpdate(
          oldProject._id,
          { $pull: { members: student._id } },
          { session: mongoSession }
        );
      }
    }

    const newProject = await createFreshStudentProject(student._id, mongoSession);

    student.program = finalProgram;
    student.batch = finalBatch;
    student.supervisorId = null;
    student.projectId = newProject._id;
    student.status = 'Unassigned';
    student.remarks = actor === 'admin' ? ADMIN_ACADEMIC_RESET_MESSAGE : STUDENT_SELF_ACADEMIC_RESET_MESSAGE;
    student.projectTitle = '';
    student.projectDesc = '';
    student.domain = '';
    student.domains = [];
    student.tools = '';
    student.pdfUrl = '';

    if (actor === 'student') {
      student.lastProgramBatchChangeAt = new Date();
    }

    await student.save({ session: mongoSession });

    return {
      message:
        actor === 'admin'
          ? 'Academic information updated by Admin. Student has been reset.'
          : 'Academic information updated. Your dashboard has been reset.',
      queuedDeletionBytes,
    };
    });
  } finally {
    await mongoSession.endSession();
  }
}
