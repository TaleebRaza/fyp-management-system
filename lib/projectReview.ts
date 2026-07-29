import Project from '../models/Project';
import User from '../models/User';
import { enqueueNotificationEmail } from './emailOutbox';
import { findSharedStorageKeys } from './storageReferenceSafety';
import { escapeHtml } from './security/input';
import { normalizeStorageKey } from './security/storage';
import {
  assertStorageLedgerReady,
  enqueueStorageDeletion,
  StorageProtocolError,
  withStorageTransaction,
} from './storageProtocol';
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
      await assertStorageLedgerReady(session);
      const key = normalizeStorageKey(project.pdfUrl);
      if (!key) {
        throw new StorageProtocolError(
          'The stored project file key is invalid. Run the storage integrity audit before advancing the stage.',
          409
        );
      }
      const sharedKeys = await findSharedStorageKeys({
        keys: [key],
        excludedProjectIds: [project._id],
        session,
      });
      if (!sharedKeys.has(key)) {
        await enqueueStorageDeletion(
          { key, bytes: Math.max(Number(project.pdfSize || 0), 0), reason: 'review-stage-advanced' },
          session
        );
      }
    }

    const supervisor = await User.findOne({ _id: assignedSupervisorId, role: 'supervisor' })
      .select('name notificationsEnabled')
      .session(session)
      .lean();
    if (supervisor && supervisor.notificationsEnabled !== false) {
      const subject = `FYP Project Update: ${reviewState.newStage ? 'Stage Advanced!' : status}`;
      const primaryColor = status === 'Approved' ? '#10b981' : status === 'Changes Requested' ? '#f59e0b' : '#ef4444';
      const backgroundColor = status === 'Approved' ? '#ecfdf5' : status === 'Changes Requested' ? '#fffbeb' : '#fef2f2';
      const html = `
        <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: sans-serif;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
            <div style="background-color: #18181b; padding: 24px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 20px;">FYP Portal Notification</h1></div>
            <div style="padding: 32px;">
              <h2 style="margin-top: 0; color: #18181b; font-size: 24px;">Project Updated</h2>
              <p style="color: #71717a; margin-bottom: 24px;">Your supervisor, <strong>${escapeHtml(supervisor.name)}</strong>, has reviewed your submission.</p>
              <div style="text-align: center; margin-bottom: 24px;"><span style="display: inline-block; background-color: ${backgroundColor}; color: ${primaryColor}; padding: 8px 16px; border-radius: 999px; font-weight: bold;">${escapeHtml(reviewState.notificationMessage)}</span></div>
              <div style="background-color: #f8fafc; border-left: 4px solid ${primaryColor}; padding: 20px;"><p style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Supervisor Remarks</p><p style="margin: 0; font-size: 15px; color: #334155; font-style: italic;">"${escapeHtml(remarks || 'Proceed to the next stage.')}"</p></div>
            </div>
          </div>
        </div>`;
      const reviewVersion = Number(project.version || 0) + 1;
      for (const member of teamMembers) {
        if (!member.email) continue;
        await enqueueNotificationEmail({
          dedupeKey: `project-review:${project._id}:${reviewVersion}:${member._id}`,
          to: member.email,
          subject,
          html,
        }, session);
      }
    }

    return { result: reviewSuccess() };
  });
  return review.result;
}
