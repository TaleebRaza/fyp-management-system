import mongoose from 'mongoose';

import Project from '../models/Project';
import User from '../models/User';
import { enqueueNotificationEmail } from './emailOutbox';
import { escapeHtml } from './security/input';
import { withStorageTransaction } from './storageProtocol';
import {
  isProjectAwaitingReview,
  getProjectProgressionState,
  isProjectProgressable,
  type ProjectReviewStatus,
  validateProjectProgressionRatings,
} from './projectReviewPolicy';

type ProjectMutationRequest = {
  studentId: string;
  remarks: string;
  expectedStage: string;
  expectedVersion: unknown;
  approverId: string;
  supervisorId?: string;
};

type ReviewProjectRequest = ProjectMutationRequest & { status: ProjectReviewStatus };
type ProgressProjectRequest = ProjectMutationRequest & { ratings?: unknown };

type ProjectMutationResult =
  | { success: true; completed?: boolean; newStage?: string }
  | {
      success: false;
      reason:
        | 'not-found'
        | 'not-reviewable'
        | 'not-progressable'
        | 'invalid-request'
        | 'ratings-required'
        | 'ratings-not-allowed';
    };

function mutationFailure(reason: Exclude<ProjectMutationResult, { success: true }>['reason']): ProjectMutationResult {
  return { success: false, reason };
}

function isValidMutationRequest(request: ProjectMutationRequest) {
  return mongoose.Types.ObjectId.isValid(request.approverId)
    && ['PROPOSAL', 'THESIS_DRAFT', 'FINAL_DELIVERABLES'].includes(request.expectedStage)
    && typeof request.expectedVersion === 'number'
    && Number.isSafeInteger(request.expectedVersion)
    && request.expectedVersion >= 0;
}

async function enqueueProjectUpdateEmails({
  projectId,
  version,
  teamMembers,
  supervisor,
  subject,
  message,
  remarks,
  tone,
  session,
}: {
  projectId: unknown;
  version: number;
  teamMembers: Array<{ _id: unknown; email?: string }>;
  supervisor: { name?: string; notificationsEnabled?: boolean } | null;
  subject: string;
  message: string;
  remarks: string;
  tone: 'success' | 'warning';
  session: mongoose.ClientSession;
}) {
  if (!supervisor || supervisor.notificationsEnabled === false) return;

  const primaryColor = tone === 'success' ? '#10b981' : '#f59e0b';
  const backgroundColor = tone === 'success' ? '#ecfdf5' : '#fffbeb';
  const html = `
    <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: sans-serif;">
      <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
        <div style="background-color: #18181b; padding: 24px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 20px;">FYP Portal Notification</h1></div>
        <div style="padding: 32px;">
          <h2 style="margin-top: 0; color: #18181b; font-size: 24px;">Project Updated</h2>
          <p style="color: #71717a; margin-bottom: 24px;">Your supervisor, <strong>${escapeHtml(supervisor.name || 'Supervisor')}</strong>, has updated your project.</p>
          <div style="text-align: center; margin-bottom: 24px;"><span style="display: inline-block; background-color: ${backgroundColor}; color: ${primaryColor}; padding: 8px 16px; border-radius: 999px; font-weight: bold;">${escapeHtml(message)}</span></div>
          <div style="background-color: #f8fafc; border-left: 4px solid ${primaryColor}; padding: 20px;"><p style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Supervisor Remarks</p><p style="margin: 0; font-size: 15px; color: #334155; font-style: italic;">"${escapeHtml(remarks)}"</p></div>
        </div>
      </div>
    </div>`;

  for (const member of teamMembers) {
    if (!member.email) continue;
    await enqueueNotificationEmail({
      dedupeKey: `project-update:${projectId}:${version}:${member._id}`,
      to: member.email,
      subject,
      html,
    }, session);
  }
}

export async function reviewProject({
  studentId,
  status,
  remarks,
  expectedStage,
  expectedVersion,
  approverId,
  supervisorId,
}: ReviewProjectRequest): Promise<ProjectMutationResult> {
  if (!isValidMutationRequest({ studentId, remarks, expectedStage, expectedVersion, approverId, supervisorId })) {
    return mutationFailure('invalid-request');
  }

  const review = await withStorageTransaction(async (session) => {
    const triggerStudent = await User.findOne({ _id: studentId, role: 'student' })
      .select('_id')
      .session(session);
    if (!triggerStudent) return { result: mutationFailure('not-found') };

    const project = await Project.findOne({
      members: triggerStudent._id,
      ...(supervisorId ? { supervisorId } : {}),
    }).session(session);
    if (!project) return { result: mutationFailure('not-found') };
    if (!isProjectAwaitingReview(project)
      || project.stage !== expectedStage
      || Number(project.version || 0) !== expectedVersion) {
      return { result: mutationFailure('not-reviewable') };
    }

    const teamMembers = await User.find({ _id: { $in: project.members }, role: 'student' })
      .select('_id email')
      .session(session)
      .lean<Array<{ _id: unknown; email?: string }>>();
    if (teamMembers.length === 0) return { result: mutationFailure('not-found') };

    const projectUpdate = await Project.updateOne(
      {
        _id: project._id,
        supervisorId: project.supervisorId,
        stage: expectedStage,
        status: 'Submitted For Review',
        pdfUrl: { $type: 'string', $ne: '' },
        ...(expectedVersion === 0
          ? { $or: [{ version: 0 }, { version: { $exists: false } }] }
          : { version: expectedVersion }),
      },
      { $set: { status, reviewRemarks: remarks }, $inc: { version: 1 } },
      { session, runValidators: true }
    );
    if (projectUpdate.modifiedCount !== 1) return { result: mutationFailure('not-reviewable') };

    const supervisor = project.supervisorId
      ? await User.findOne({ _id: project.supervisorId, role: 'supervisor' })
          .select('name notificationsEnabled')
          .session(session)
          .lean<{ name?: string; notificationsEnabled?: boolean }>()
      : null;
    await enqueueProjectUpdateEmails({
      projectId: project._id,
      version: expectedVersion + 1,
      teamMembers,
      supervisor,
      subject: `FYP Document Update: ${status}`,
      message: status,
      remarks,
      tone: status === 'Document Approved' ? 'success' : 'warning',
      session,
    });

    return { result: { success: true } as ProjectMutationResult };
  });
  return review.result;
}

export async function progressProjectStage({
  studentId,
  remarks,
  expectedStage,
  expectedVersion,
  approverId,
  ratings,
  supervisorId,
}: ProgressProjectRequest): Promise<ProjectMutationResult> {
  if (!isValidMutationRequest({ studentId, remarks, expectedStage, expectedVersion, approverId, supervisorId })) {
    return mutationFailure('invalid-request');
  }

  const ratingValidation = validateProjectProgressionRatings({ stage: expectedStage, ratings });
  if (!ratingValidation.success) return mutationFailure(ratingValidation.reason);

  const progression = await withStorageTransaction(async (session) => {
    const triggerStudent = await User.findOne({ _id: studentId, role: 'student' })
      .select('_id')
      .session(session);
    if (!triggerStudent) return { result: mutationFailure('not-found') };

    const project = await Project.findOne({
      members: triggerStudent._id,
      ...(supervisorId ? { supervisorId } : {}),
    }).session(session);
    if (!project) return { result: mutationFailure('not-found') };
    if (!isProjectProgressable(project)
      || project.stage !== expectedStage
      || Number(project.version || 0) !== expectedVersion
      || (ratingValidation.ratingRound && project.ratings?.[ratingValidation.ratingRound])) {
      return { result: mutationFailure('not-progressable') };
    }

    const teamMembers = await User.find({ _id: { $in: project.members }, role: 'student' })
      .select('_id email')
      .session(session)
      .lean<Array<{ _id: unknown; email?: string }>>();
    if (teamMembers.length === 0) return { result: mutationFailure('not-found') };

    const progressionState = getProjectProgressionState(expectedStage);
    if (!progressionState) return { result: mutationFailure('invalid-request') };
    const { newStage, completed } = progressionState;
    const ratingSnapshot = ratingValidation.ratingRound
      ? { ...ratingValidation.ratings, ratedAt: new Date(), ratedBy: approverId }
      : null;
    const projectUpdate = await Project.updateOne(
      {
        _id: project._id,
        supervisorId: project.supervisorId,
        stage: expectedStage,
        status: 'Document Approved',
        pdfUrl: { $type: 'string', $ne: '' },
        $and: [
          { version: expectedVersion },
          ...(ratingValidation.ratingRound
            ? [{ [`ratings.${ratingValidation.ratingRound}`]: null }]
            : []),
        ],
      },
      {
        $set: {
          status: progressionState.status,
          reviewRemarks: remarks,
          ...(newStage ? { stage: newStage } : {}),
          ...(ratingValidation.ratingRound && ratingSnapshot
            ? { [`ratings.${ratingValidation.ratingRound}`]: ratingSnapshot }
            : {}),
        },
        $inc: { version: 1 },
      },
      { session, runValidators: true }
    );
    if (projectUpdate.modifiedCount !== 1) return { result: mutationFailure('not-progressable') };

    const supervisor = project.supervisorId
      ? await User.findOne({ _id: project.supervisorId, role: 'supervisor' })
          .select('name notificationsEnabled')
          .session(session)
          .lean<{ name?: string; notificationsEnabled?: boolean }>()
      : null;
    const message = completed
      ? 'Final deliverables approved. Your FYP is complete.'
      : `Project progressed to ${newStage === 'THESIS_DRAFT' ? 'Thesis Draft' : 'Final Deliverables'}.`;
    await enqueueProjectUpdateEmails({
      projectId: project._id,
      version: expectedVersion + 1,
      teamMembers,
      supervisor,
      subject: completed ? 'FYP Project Completed' : 'FYP Project Stage Progressed',
      message,
      remarks,
      tone: 'success',
      session,
    });

    return { result: { success: true, completed, newStage } as ProjectMutationResult };
  });
  return progression.result;
}
