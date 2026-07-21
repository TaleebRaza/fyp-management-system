import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import mongoose, { type ClientSession } from 'mongoose';

import { AcademicResetError, resetStudentAcademicInfo } from './academicReset';
import { DEFAULT_PROJECT_STAGE, PROJECT_STAGES } from '../config/appSettings';
import { buildProjectSubmissionEmail } from './dashboardEmailTemplates';
import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
  validateProjectDomainIds,
} from '../config/projectDomains';
import { sendNotificationEmail } from './mailer';
import { deleteR2Targets } from './r2Deletion';
import { dedupeR2DeletionTargets, toR2DeletionTarget, type R2DeletionTarget } from './r2Cleanup';
import { reserveSupervisorCapacity } from './supervisorCapacity';
import { withTransactionRetry } from './transactionUtils';
import SystemConfig from '../models/SystemConfig';
import User from '../models/User';
import Project from '../models/Project';
import VoiceNote from '../models/VoiceNote';

type ProgramBatchUpdateBody = {
  id?: unknown;
  program?: unknown;
  batch?: unknown;
};

export async function updateStudentProgramBatch(req: NextRequest, body: ProgramBatchUpdateBody) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token || token.role !== 'student' || String(token.id) !== String(body.id)) {
    return NextResponse.json({ error: 'Unauthorized Program/Batch update request.' }, { status: 401 });
  }

  try {
    const result = await resetStudentAcademicInfo({
      targetUserId: String(body.id || '').trim(),
      newProgram: String(body.program || '').trim().toUpperCase(),
      newBatch: String(body.batch || '').trim(),
      actor: 'student',
      enforceStudentCooldown: true,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof AcademicResetError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    console.error('Program/Batch Update Error:', error);
    return NextResponse.json({ error: 'Failed to update Program/Batch.' }, { status: 500 });
  }
}

type AssignSupervisorBody = {
  id?: unknown;
  supervisorId?: unknown;
};

export async function assignStudentSupervisor(req: NextRequest, body: AssignSupervisorBody) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token || token.role !== 'student' || String(token.id) !== String(body.id)) {
    return NextResponse.json({ error: 'Unauthorized supervisor assignment request.' }, { status: 401 });
  }

  if (
    !mongoose.Types.ObjectId.isValid(String(body.id || '')) ||
    !mongoose.Types.ObjectId.isValid(String(body.supervisorId || ''))
  ) {
    return NextResponse.json({ error: 'Invalid student or supervisor.' }, { status: 400 });
  }

  const session = await mongoose.startSession();

  try {
    return await withTransactionRetry(session, async () => {
      const triggeringStudent = await User.findById(body.id).session(session);
      if (!triggeringStudent) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }

      if (triggeringStudent.supervisorId && triggeringStudent.status !== 'Unassigned') {
        return NextResponse.json(
          { error: 'You already have a supervisor. Use the change supervisor option instead.' },
          { status: 400 }
        );
      }

      const capacity = await reserveSupervisorCapacity(String(body.supervisorId), session);

      if (capacity.kind === 'missing') {
        return NextResponse.json({ error: 'Selected supervisor was not found.' }, { status: 404 });
      }

      if (capacity.kind === 'full') {
        return NextResponse.json(
          { error: `Cannot assign. The selected supervisor has reached maximum capacity (${capacity.maxSlots} slots).` },
          { status: 409 }
        );
      }

      const supervisorId = new mongoose.Types.ObjectId(String(body.supervisorId));

      if (triggeringStudent.projectId) {
        await Project.findByIdAndUpdate(
          triggeringStudent.projectId,
          { $set: { supervisorId } },
          { session }
        );
        await User.updateMany(
          { projectId: triggeringStudent.projectId },
          { $set: { supervisorId, status: 'Pending', remarks: '' } },
          { session }
        );
      } else {
        await User.findByIdAndUpdate(
          body.id,
          { $set: { supervisorId, status: 'Pending', remarks: '' } },
          { session }
        );
      }

      return NextResponse.json({ message: 'Supervisor successfully assigned to your team!' }, { status: 200 });
    });
  } finally {
    session.endSession();
  }
}

type ChangeSupervisorBody = {
  id?: unknown;
  supervisorId?: unknown;
};

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
    } catch (error: unknown) {
      if (!(typeof error === 'object' && error && 'code' in error && error.code === 11000)) throw error;
    }
  }

  throw new Error('Failed to generate a unique project invite code.');
}

export async function changeStudentSupervisor(req: NextRequest, body: ChangeSupervisorBody) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

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
          oldProjectMembers.every((member: unknown) => String(member) === String(student._id));

        if (isOnlyMember) {
          const voiceNotes = await VoiceNote.find({ projectId: oldProject._id }).session(session);

          deletionTargets = dedupeR2DeletionTargets(
            [
              toR2DeletionTarget(oldProject.pdfUrl, oldProject.pdfSize),
              String(student.pdfUrl || '') !== String(oldProject.pdfUrl || '')
                ? toR2DeletionTarget(student.pdfUrl, oldProject.pdfSize)
                : null,
              ...voiceNotes.map(note => toR2DeletionTarget(note.blobUrl, note.fileSize)).filter(Boolean),
            ].filter(Boolean) as R2DeletionTarget[]
          );

          freedBytes = deletionTargets.reduce((sum, target) => sum + target.size, 0);
          await deleteR2Targets(deletionTargets);

          if (voiceNotes.length > 0) {
            await VoiceNote.deleteMany({
              _id: { $in: voiceNotes.map(note => note._id) },
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

      const freshProject = await createFreshStudentProject(student._id, session, capacity.supervisor._id);

      student.supervisorId = capacity.supervisor._id;
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
        response: NextResponse.json(
          {
            message: leftTeam
              ? 'Supervisor changed. You left your old team and started fresh under the new supervisor.'
              : 'Supervisor changed. Your previous project files were deleted and you started fresh.',
            freedBytes,
          },
          { status: 200 }
        ),
      };
    });

    if (result instanceof NextResponse) return result;

    return result.response;
  } catch (error: unknown) {
    console.error('Supervisor Change Error:', error);
    return NextResponse.json({ error: 'Failed to change supervisor.' }, { status: 500 });
  } finally {
    session.endSession();
  }
}

type ProjectSubmissionBody = {
  id?: unknown;
  title?: unknown;
  desc?: unknown;
  domains?: unknown;
  domain?: unknown;
  tools?: unknown;
  pdfUrl?: unknown;
  fileSize?: unknown;
};

function generateProjectTitleFingerprint(title: string) {
  if (!title) return '';

  const cleanTitle = title.toLowerCase().replace(/[^\w\s]/g, '');
  const stopWords = new Set([
    'a', 'an', 'the', 'for', 'and', 'nor', 'but', 'or', 'yet', 'so', 'of', 'at', 'by', 'from', 'in', 'into', 'on', 'to', 'with', 'using', 'based',
    'system', 'smart', 'advanced', 'iot', 'project', 'application', 'app', 'web', 'design', 'implementation', 'development',
  ]);

  return cleanTitle.split(/\s+/).filter(word => word.length > 0 && !stopWords.has(word)).sort().join('-');
}

export async function submitStudentProject(req: NextRequest, body: ProjectSubmissionBody) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token?.id || token.role !== 'student' || String(token.id) !== String(body.id)) {
    return NextResponse.json({ error: 'Unauthorized project submission request.' }, { status: 401 });
  }

  const triggeringStudent = await User.findById(body.id);
  if (!triggeringStudent) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const title = String(body.title || '');
  const description = String(body.desc || '');
  const legacyDomainText = String(body.domain || '').trim();
  const tools = String(body.tools || '');
  const pdfUrl = String(body.pdfUrl || '');
  const fileSize = Math.max(Number(body.fileSize || 0), 0);
  const hasDomainArrayPayload = Object.prototype.hasOwnProperty.call(body, 'domains');
  let selectedDomainIds: string[] = [];

  if (hasDomainArrayPayload) {
    const domainValidation = validateProjectDomainIds(body.domains);

    if (!domainValidation.isArray) {
      return NextResponse.json({ error: 'Project domains must be submitted as a list.' }, { status: 400 });
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
      return NextResponse.json({ error: 'Select at least one project domain.' }, { status: 400 });
    }

    selectedDomainIds = domainValidation.ids;
  } else {
    selectedDomainIds = normalizeProjectDomainIds([], legacyDomainText);

    if (!legacyDomainText && selectedDomainIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one project domain.' }, { status: 400 });
    }
  }

  const normalizedDomainText = formatProjectDomainLabels(selectedDomainIds, legacyDomainText);
  const fingerprint = generateProjectTitleFingerprint(title);

  if (triggeringStudent.projectId) {
    const duplicateProject = await Project.findOne({
      titleFingerprint: fingerprint,
      _id: { $ne: triggeringStudent.projectId },
      $or: [{ status: 'Approved' }, { stage: { $in: PROJECT_STAGES.slice(1) } }],
    });

    if (duplicateProject) {
      return NextResponse.json(
        { error: 'A project utilizing these core concepts has already been approved for another team. Please select a unique topic.' },
        { status: 409 }
      );
    }
  }

  const oldPdfUrl = triggeringStudent.pdfUrl;
  let sizeDelta = 0;
  const targetProject = triggeringStudent.projectId
    ? await Project.findById(triggeringStudent.projectId)
    : null;

  if (oldPdfUrl && pdfUrl && oldPdfUrl !== pdfUrl) {
    try {
      const target = toR2DeletionTarget(oldPdfUrl, targetProject?.pdfSize);
      if (target) await deleteR2Targets([target]);

      sizeDelta -= targetProject?.pdfSize || 0;
      console.log(`🧹 PDF Orphan Prevention: Wiped old proposal blob -> ${target?.key || oldPdfUrl}`);
    } catch (error: unknown) {
      console.error('Failed to delete old PDF blob:', error);
    }
  }

  if (fileSize > 0) sizeDelta += fileSize;

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
    status: 'Submitted For Review',
  };

  let updatedStudent;

  if (triggeringStudent.projectId) {
    const projectUpdates: {
      title: string;
      titleFingerprint: string;
      domain: string;
      domains: string[];
      pdfUrl: string;
      status: string;
      pdfSize?: number;
    } = {
      title,
      titleFingerprint: fingerprint,
      domain: normalizedDomainText,
      domains: selectedDomainIds,
      pdfUrl,
      status: 'Submitted For Review',
    };
    if (fileSize > 0) projectUpdates.pdfSize = fileSize;

    await Promise.all([
      Project.findByIdAndUpdate(triggeringStudent.projectId, { $set: projectUpdates }),
      User.updateMany({ projectId: triggeringStudent.projectId }, { $set: submissionData }),
    ]);
    updatedStudent = await User.findById(body.id);
  } else {
    updatedStudent = await User.findByIdAndUpdate(body.id, { $set: submissionData }, { returnDocument: 'after' });
  }

  if (updatedStudent?.supervisorId) {
    const supervisor = await User.findById(updatedStudent.supervisorId);
    if (supervisor?.email && supervisor.notificationsEnabled !== false) {
      const email = buildProjectSubmissionEmail({
        studentName: String(updatedStudent.name || ''),
        domainText: normalizedDomainText,
        title,
      });
      await sendNotificationEmail(supervisor.email, email.subject, email.html);
    }
  }

  return NextResponse.json({ message: 'Project Submitted!' }, { status: 200 });
}
