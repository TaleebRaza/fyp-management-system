import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import mongoose from 'mongoose';
import { BUCKET_NAME, s3Client } from './s3-client';
import SystemConfig from '../models/SystemConfig';
import Project from '../models/Project';
import User from '../models/User';
import { sendNotificationEmail } from './mailer';
import { escapeHtml } from './security/input';
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

function getR2ObjectKey(value: string) {
  const trimmedValue = String(value || '').trim();
  if (!trimmedValue) return '';

  try {
    return decodeURIComponent(new URL(trimmedValue).pathname.replace(/^\/+/, ''));
  } catch {
    return trimmedValue.replace(/^\/+/, '');
  }
}

async function deletePreviousStagePdf(fileUrl: string, fileSize: number, projectId: unknown) {
  const key = getR2ObjectKey(fileUrl);
  if (!key) return;

  const sameFileUsedElsewhere = await Project.exists({
    _id: { $ne: projectId },
    pdfUrl: fileUrl,
  });

  if (sameFileUsedElsewhere) return;

  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));

    const size = Math.max(Number(fileSize || 0), 0);
    if (size > 0) {
      await SystemConfig.findOneAndUpdate(
        { configKey: 'storage' },
        { $inc: { usedBytes: -size } },
        { upsert: true }
      );
      await SystemConfig.updateOne(
        { configKey: 'storage', usedBytes: { $lt: 0 } },
        { $set: { usedBytes: 0 } }
      );
    }
  } catch (error) {
    console.error('Failed to wipe old stage PDF:', error instanceof Error ? error.message : error);
  }
}

export async function reviewProject({
  studentId,
  status,
  remarks,
  supervisorId,
  requireAwaitingReview = false,
}: ReviewProjectRequest): Promise<ReviewProjectResult> {
  const triggerStudent = await User.findOne({
    _id: studentId,
    role: 'student',
    ...(supervisorId ? { supervisorId } : {}),
  })
    .select('_id email projectId supervisorId pdfUrl status')
    .lean();

  if (!triggerStudent) return { success: false, reason: 'not-found' };
  if (requireAwaitingReview && !isProjectAwaitingReview(triggerStudent)) {
    return { success: false, reason: 'not-reviewable' };
  }

  const assignedSupervisorId = String(triggerStudent.supervisorId || '');
  if (!mongoose.Types.ObjectId.isValid(assignedSupervisorId)) {
    return { success: false, reason: 'not-found' };
  }

  const teamMembers = triggerStudent.projectId
    ? await User.find({
        projectId: triggerStudent.projectId,
        role: 'student',
        supervisorId: assignedSupervisorId,
      })
        .select('_id email')
        .lean()
    : [triggerStudent];

  let finalStatus: string = status;
  let newStage: string | undefined;
  let notificationMessage = `Status: ${status}`;
  const project = triggerStudent.projectId
    ? await Project.findOne({ _id: triggerStudent.projectId, supervisorId: assignedSupervisorId })
    : null;

  if (status === 'Approved' && project) {
    if (project.stage === 'PROPOSAL') {
      newStage = 'THESIS_DRAFT';
      finalStatus = 'Pending';
      notificationMessage = 'Proposal Approved! Please begin uploading your Thesis Chapters.';
    } else if (project.stage === 'THESIS_DRAFT') {
      newStage = 'FINAL_DELIVERABLES';
      finalStatus = 'Pending';
      notificationMessage = 'Thesis Approved! Please submit your Final Deliverables.';
    } else {
      finalStatus = 'Approved';
      notificationMessage = 'Congratulations! Your FYP is fully Approved and completed.';
    }

    if (newStage && project.pdfUrl) {
      await deletePreviousStagePdf(project.pdfUrl, project.pdfSize, project._id);
    }
  }

  await User.updateMany(
    { _id: { $in: teamMembers.map((member) => member._id) } },
    {
      $set: {
        status: finalStatus,
        remarks: remarks || notificationMessage,
        ...(newStage ? { pdfUrl: '' } : {}),
      },
    }
  );

  if (triggerStudent.projectId) {
    await Project.findOneAndUpdate(
      { _id: triggerStudent.projectId, supervisorId: assignedSupervisorId },
      {
        $set: {
          status: finalStatus,
          ...(newStage ? { stage: newStage, pdfUrl: '', pdfSize: 0 } : {}),
        },
      }
    );
  }

  const supervisor = await User.findById(assignedSupervisorId)
    .select('name notificationsEnabled')
    .lean();
  if (supervisor && supervisor.notificationsEnabled !== false) {
    const subject = `FYP Project Update: ${newStage ? 'Stage Advanced!' : status}`;
    const primaryColor = status === 'Approved' ? '#10b981' : status === 'Changes Requested' ? '#f59e0b' : '#ef4444';
    const backgroundColor = status === 'Approved' ? '#ecfdf5' : status === 'Changes Requested' ? '#fffbeb' : '#fef2f2';
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
