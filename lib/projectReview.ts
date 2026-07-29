import Project from '../models/Project';
import User from '../models/User';
import { sendNotificationEmail } from './mailer';
import { escapeHtml } from './security/input';
import { normalizeStorageKey } from './security/storage';
import { enqueueStorageDeletion, withStorageTransaction } from './storageProtocol';
import {
  isProjectAwaitingReview,
  type ProjectReviewStatus,
} from './projectReviewPolicy';

type ReviewProjectRequest = {
  studentId: string;
  status: ProjectReviewStatus;
  remarks: string;
  supervisorId?: string;
  requireAwaitingReview?: boolean;
};

type ReviewProjectResult =
  | { success: true }
  | { success: false; reason: 'not-found' | 'not-reviewable' };

type ReviewNotification = {
  supervisorId: string;
  teamMembers: Array<{ email?: string }>;
  status: string;
  newStage?: string;
  notificationMessage: string;
};

function reviewFailure(reason: 'not-found' | 'not-reviewable'): ReviewProjectResult {
  return { success: false, reason };
}

function reviewSuccess(): ReviewProjectResult {
  return { success: true };
}

function nextProjectReviewState(status: ProjectReviewStatus, stage: string) {
  if (status !== 'Approved') {
    return { finalStatus: status, notificationMessage: `Status: ${status}` };
  }
  if (stage === 'PROPOSAL') {
    return {
      finalStatus: 'Pending',
      newStage: 'THESIS_DRAFT',
      notificationMessage: 'Proposal Approved! Please begin uploading your Thesis Chapters.',
    };
  }
  if (stage === 'THESIS_DRAFT') {
    return {
      finalStatus: 'Pending',
      newStage: 'FINAL_DELIVERABLES',
      notificationMessage: 'Thesis Approved! Please submit your Final Deliverables.',
    };
  }
  return {
    finalStatus: 'Approved',
    notificationMessage: 'Congratulations! Your FYP is fully Approved and completed.',
  };
}

export async function reviewProject({
  studentId,
  status,
  remarks,
  supervisorId,
  requireAwaitingReview = false,
}: ReviewProjectRequest): Promise<ReviewProjectResult> {
  const review = await withStorageTransaction(async (session) => {
    const triggerStudent = await User.findOne({
      _id: studentId,
      role: 'student',
      ...(supervisorId ? { supervisorId } : {}),
    })
      .select('_id projectId')
      .session(session);
    if (!triggerStudent?.projectId) return { result: reviewFailure('not-found') };

    const project = await Project.findOne({
      _id: triggerStudent.projectId,
      members: triggerStudent._id,
      ...(supervisorId ? { supervisorId } : {}),
    }).session(session);
    if (!project || (requireAwaitingReview && !isProjectAwaitingReview(project))) {
      return { result: reviewFailure(project ? 'not-reviewable' : 'not-found') };
    }

    const assignedSupervisorId = String(project.supervisorId || '');
    if (!assignedSupervisorId) return { result: reviewFailure('not-found') };

    const teamMembers = await User.find({
      _id: { $in: project.members },
      role: 'student',
      projectId: project._id,
    })
      .select('_id email')
      .session(session)
      .lean();
    if (teamMembers.length === 0) return { result: reviewFailure('not-found') };

    const reviewState = nextProjectReviewState(status, project.stage);
    const projectUpdate = await Project.updateOne(
      {
        _id: project._id,
        supervisorId: project.supervisorId,
        $or: [{ version: Number(project.version || 0) }, { version: { $exists: false } }],
      },
      {
        $set: {
          status: reviewState.finalStatus,
          ...(reviewState.newStage ? { stage: reviewState.newStage, pdfUrl: '', pdfSize: 0 } : {}),
        },
        $inc: { version: 1 },
      },
      { session }
    );
    if (projectUpdate.modifiedCount !== 1) {
      return { result: reviewFailure('not-reviewable') };
    }

    await User.updateMany(
      { _id: { $in: teamMembers.map((member) => member._id) } },
      {
        $set: {
          status: reviewState.finalStatus,
          remarks: remarks || reviewState.notificationMessage,
          ...(reviewState.newStage ? { pdfUrl: '' } : {}),
        },
      },
      { session }
    );

    if (reviewState.newStage && project.pdfUrl) {
      const key = normalizeStorageKey(project.pdfUrl);
      const isShared = key && await Project.exists({ _id: { $ne: project._id }, pdfUrl: project.pdfUrl }).session(session);
      if (key && !isShared) {
        await enqueueStorageDeletion(
          { key, bytes: Math.max(Number(project.pdfSize || 0), 0), reason: 'review-stage-advanced' },
          session
        );
      }
    }

    return {
      result: reviewSuccess(),
      notification: {
        supervisorId: assignedSupervisorId,
        teamMembers,
        status,
        newStage: reviewState.newStage,
        notificationMessage: reviewState.notificationMessage,
      } satisfies ReviewNotification,
    };
  });
  if (!review.result.success || !review.notification) return review.result;

  const supervisor = await User.findById(review.notification.supervisorId)
    .select('name notificationsEnabled')
    .lean();
  if (supervisor && supervisor.notificationsEnabled !== false) {
    const { status: reviewStatus, newStage, notificationMessage, teamMembers } = review.notification;
    const subject = `FYP Project Update: ${newStage ? 'Stage Advanced!' : reviewStatus}`;
    const primaryColor = reviewStatus === 'Approved' ? '#10b981' : reviewStatus === 'Changes Requested' ? '#f59e0b' : '#ef4444';
    const backgroundColor = reviewStatus === 'Approved' ? '#ecfdf5' : reviewStatus === 'Changes Requested' ? '#fffbeb' : '#fef2f2';
    const htmlContent = `
      <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: sans-serif;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
          <div style="background-color: #18181b; padding: 24px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 20px;">FYP Portal Notification</h1></div>
          <div style="padding: 32px;">
            <h2 style="margin-top: 0; color: #18181b; font-size: 24px;">Project Updated</h2>
            <p style="color: #71717a; margin-bottom: 24px;">Your supervisor, <strong>${escapeHtml(supervisor.name)}</strong>, has reviewed your submission.</p>
            <div style="text-align: center; margin-bottom: 24px;"><span style="display: inline-block; background-color: ${backgroundColor}; color: ${primaryColor}; padding: 8px 16px; border-radius: 999px; font-weight: bold;">${escapeHtml(notificationMessage)}</span></div>
            <div style="background-color: #f8fafc; border-left: 4px solid ${primaryColor}; padding: 20px;"><p style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Supervisor Remarks</p><p style="margin: 0; font-size: 15px; color: #334155; font-style: italic;">"${escapeHtml(remarks || 'Proceed to the next stage.')}"</p></div>
          </div>
        </div>
      </div>`;

    await Promise.all(teamMembers.flatMap((member) => member.email
      ? [sendNotificationEmail(member.email, subject, htmlContent)]
      : []));
  }

  return { success: true };
}
