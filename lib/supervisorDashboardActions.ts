import { NextResponse } from 'next/server';
import mongoose, { type ClientSession } from 'mongoose';

import { DEFAULT_PROJECT_STAGE, PROJECT_STAGES } from '../config/appSettings';
import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../config/projectDomains';
import { buildProjectStatusEmail } from './dashboardEmailTemplates';
import { sendNotificationEmail } from './mailer';
import { deleteR2Targets } from './r2Deletion';
import { toR2DeletionTarget } from './r2Cleanup';
import { decrementStorageLedger } from './storageLedger';
import { reserveSupervisorCapacity } from './supervisorCapacity';
import { withTransactionRetry } from './transactionUtils';
import Project from '../models/Project';
import User from '../models/User';

const [PROPOSAL_STAGE, THESIS_DRAFT_STAGE, FINAL_DELIVERABLES_STAGE] = PROJECT_STAGES;

export type SupervisorDashboardActionBody = {
  action?: unknown;
  studentId?: unknown;
  status?: unknown;
  remarks?: unknown;
  migrationCode?: unknown;
};

export type SupervisorDashboardActor = {
  id: string;
  role: 'supervisor' | 'admin';
};

export function isSupervisorStudentAction(action: unknown) {
  return action === 'updateStatus' || action === 'migrate' || action === 'removeStudent';
}

type NewProjectData = {
  supervisorId: unknown;
  members: unknown[];
  stage: string;
  status: string;
  title: string;
  titleFingerprint: string;
  domain: string;
  domains: string[];
  pdfUrl: string;
  pdfSize: number;
};

type SupervisorTargetStudent = {
  _id?: unknown;
  projectId?: unknown;
  supervisorId?: unknown;
};

async function createProjectWithUniqueInviteCode(projectData: NewProjectData, session: ClientSession) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const project = new Project({ ...projectData, inviteCode });
      await project.save({ session });
      return project;
    } catch (error: unknown) {
      if (!(typeof error === 'object' && error && 'code' in error && error.code === 11000)) throw error;
    }
  }

  throw new Error('Failed to generate a unique project invite code.');
}

export async function runSupervisorDashboardAction({
  actor,
  body,
  targetStudent,
}: {
  actor: SupervisorDashboardActor;
  body: SupervisorDashboardActionBody;
  targetStudent: SupervisorTargetStudent;
}) {
  const action = body.action;

  if (action === 'updateStatus') {
    const triggerStudent = targetStudent;
    const status = String(body.status || '');
    const remarks = String(body.remarks || '');
    const teamMembers = triggerStudent.projectId
      ? await User.find({ projectId: triggerStudent.projectId })
      : [triggerStudent];

    let finalStatus = status;
    let newStage: string | undefined;
    let notificationMessage = `Status: ${status}`;

    if (status === 'Approved' && triggerStudent.projectId) {
      const project = await Project.findById(triggerStudent.projectId);

      if (project) {
        if (project.stage === PROPOSAL_STAGE) {
          newStage = THESIS_DRAFT_STAGE;
          finalStatus = 'Pending';
          notificationMessage = 'Proposal Approved! Please begin uploading your Thesis Chapters.';
        } else if (project.stage === THESIS_DRAFT_STAGE) {
          newStage = FINAL_DELIVERABLES_STAGE;
          finalStatus = 'Pending';
          notificationMessage = 'Thesis Approved! Please submit your Final Deliverables.';
        } else {
          finalStatus = 'Approved';
          notificationMessage = 'Congratulations! Your FYP is fully Approved and completed.';
        }

        if (newStage && project.pdfUrl) {
          const target = toR2DeletionTarget(project.pdfUrl, project.pdfSize);
          const sameFileUsedElsewhere = await Project.exists({
            _id: { $ne: project._id },
            pdfUrl: project.pdfUrl,
          });

          if (target && !sameFileUsedElsewhere) {
            await deleteR2Targets([target]);
            await decrementStorageLedger(target.size);
            console.log(`Timeline advance cleanup: deleted previous stage PDF -> ${target.key}`);
          }
        }
      }
    }

    await User.updateMany(
      { _id: { $in: teamMembers.map(member => member._id) } },
      {
        $set: {
          status: finalStatus,
          remarks: remarks || notificationMessage,
          ...(newStage ? { pdfUrl: '' } : {}),
        },
      }
    );

    if (triggerStudent.projectId) {
      await Project.findByIdAndUpdate(triggerStudent.projectId, {
        $set: {
          status: finalStatus,
          ...(newStage ? { stage: newStage, pdfUrl: '', pdfSize: 0 } : {}),
        },
      });
    }

    await Promise.all(
      teamMembers.map(async member => {
        if (member.supervisorId && member.email) {
          const supervisor = await User.findById(member.supervisorId);
          if (supervisor && supervisor.notificationsEnabled !== false) {
            const email = buildProjectStatusEmail({
              supervisorName: String(supervisor.name || ''),
              status,
              notificationMessage,
              remarks,
              stageAdvanced: Boolean(newStage),
            });
            return sendNotificationEmail(member.email, email.subject, email.html);
          }
        }
      })
    );

    return NextResponse.json({ message: 'Status updated and timeline advanced!' }, { status: 200 });
  }

  if (action === 'migrate') {
    const requestedStudentId = String(body.studentId || '').trim();
    const requestedMigrationCode = String(body.migrationCode || '').trim().toUpperCase();

    if (!mongoose.Types.ObjectId.isValid(requestedStudentId)) {
      return NextResponse.json({ error: 'Invalid student selected.' }, { status: 400 });
    }

    if (!requestedMigrationCode) {
      return NextResponse.json({ error: 'Migration code is required.' }, { status: 400 });
    }

    const session = await mongoose.startSession();

    try {
      return await withTransactionRetry(session, async () => {
        const targetSupervisor = await User.findOne({
          role: 'supervisor',
          migrationCode: requestedMigrationCode,
        })
          .select('_id name extraSlots')
          .session(session);

        if (!targetSupervisor) {
          return NextResponse.json({ error: 'Invalid Migration Code!' }, { status: 400 });
        }

        const studentInTransaction = await User.findById(requestedStudentId).session(session);
        if (!studentInTransaction || studentInTransaction.role !== 'student') {
          return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
        }

        if (actor.role === 'supervisor' && String(studentInTransaction.supervisorId || '') !== actor.id) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        if (String(studentInTransaction.supervisorId || '') === String(targetSupervisor._id)) {
          return NextResponse.json(
            { error: 'This student is already assigned to the target supervisor.' },
            { status: 400 }
          );
        }

        const capacity = await reserveSupervisorCapacity(String(targetSupervisor._id), session);
        if (capacity.kind === 'missing') {
          return NextResponse.json({ error: 'Invalid Migration Code!' }, { status: 400 });
        }

        if (capacity.kind === 'full') {
          return NextResponse.json(
            { error: `Target supervisor has reached maximum capacity (${capacity.maxSlots} slots).` },
            { status: 409 }
          );
        }

        const oldProject = studentInTransaction.projectId
          ? await Project.findById(studentInTransaction.projectId).session(session)
          : null;

        if (!oldProject) {
          const inheritedDomainIds = normalizeProjectDomainIds(
            studentInTransaction.domains,
            studentInTransaction.domain
          );
          const inheritedDomainText = formatProjectDomainLabels(inheritedDomainIds, studentInTransaction.domain);
          const newProject = await createProjectWithUniqueInviteCode(
            {
              supervisorId: targetSupervisor._id,
              members: [studentInTransaction._id],
              stage: DEFAULT_PROJECT_STAGE,
              status: studentInTransaction.status || 'Pending',
              title: studentInTransaction.projectTitle || '',
              titleFingerprint: '',
              domain: inheritedDomainText,
              domains: inheritedDomainIds,
              pdfUrl: studentInTransaction.pdfUrl || '',
              pdfSize: 0,
            },
            session
          );

          studentInTransaction.domain = inheritedDomainText;
          studentInTransaction.domains = inheritedDomainIds;
          studentInTransaction.supervisorId = targetSupervisor._id;
          studentInTransaction.projectId = newProject._id;
          studentInTransaction.status = studentInTransaction.status || 'Pending';
          studentInTransaction.remarks = `Migrated to supervisor ${targetSupervisor.name}.`;
          await studentInTransaction.save({ session });
        } else {
          const projectMembers = Array.isArray(oldProject.members) ? oldProject.members : [];
          const isOnlyMember =
            projectMembers.length <= 1 ||
            projectMembers.every((member: unknown) => String(member) === String(studentInTransaction._id));

          if (isOnlyMember) {
            const inheritedDomainIds = normalizeProjectDomainIds(
              oldProject.domains?.length ? oldProject.domains : studentInTransaction.domains,
              oldProject.domain || studentInTransaction.domain
            );
            const inheritedDomainText = formatProjectDomainLabels(
              inheritedDomainIds,
              oldProject.domain || studentInTransaction.domain
            );

            oldProject.supervisorId = targetSupervisor._id;
            oldProject.members = [studentInTransaction._id];
            oldProject.domain = inheritedDomainText;
            oldProject.domains = inheritedDomainIds;
            await oldProject.save({ session });

            studentInTransaction.domain = inheritedDomainText;
            studentInTransaction.domains = inheritedDomainIds;
            studentInTransaction.supervisorId = targetSupervisor._id;
            studentInTransaction.projectId = oldProject._id;
            studentInTransaction.status = oldProject.status || studentInTransaction.status || 'Pending';
            studentInTransaction.remarks = `Migrated to supervisor ${targetSupervisor.name}. Project status and timeline were preserved.`;
            await studentInTransaction.save({ session });
          } else {
            await Project.findByIdAndUpdate(
              oldProject._id,
              { $pull: { members: studentInTransaction._id } },
              { session }
            );

            const inheritedTitle = oldProject.title || studentInTransaction.projectTitle || '';
            const inheritedDomainIds = normalizeProjectDomainIds(
              oldProject.domains?.length ? oldProject.domains : studentInTransaction.domains,
              oldProject.domain || studentInTransaction.domain
            );
            const inheritedDomain = formatProjectDomainLabels(
              inheritedDomainIds,
              oldProject.domain || studentInTransaction.domain
            );
            const newProject = await createProjectWithUniqueInviteCode(
              {
                supervisorId: targetSupervisor._id,
                members: [studentInTransaction._id],
                stage: oldProject.stage || DEFAULT_PROJECT_STAGE,
                status: oldProject.status || studentInTransaction.status || 'Pending',
                title: inheritedTitle,
                titleFingerprint: oldProject.titleFingerprint || '',
                domain: inheritedDomain,
                domains: inheritedDomainIds,
                pdfUrl: '',
                pdfSize: 0,
              },
              session
            );

            studentInTransaction.supervisorId = targetSupervisor._id;
            studentInTransaction.projectId = newProject._id;
            studentInTransaction.status = oldProject.status || studentInTransaction.status || 'Pending';
            studentInTransaction.remarks = `Migrated to supervisor ${targetSupervisor.name}. Project status and timeline were preserved.`;
            studentInTransaction.projectTitle = inheritedTitle;
            studentInTransaction.projectDesc = studentInTransaction.projectDesc || '';
            studentInTransaction.domain = inheritedDomain;
            studentInTransaction.domains = inheritedDomainIds;
            studentInTransaction.tools = studentInTransaction.tools || '';
            studentInTransaction.pdfUrl = '';
            await studentInTransaction.save({ session });
          }
        }

        return NextResponse.json(
          { message: 'Student migrated successfully. Project status and timeline were preserved.' },
          { status: 200 }
        );
      });
    } catch (error: unknown) {
      console.error('Migration transaction error:', error);
      return NextResponse.json({ error: 'Migration failed. Please try again.' }, { status: 500 });
    } finally {
      session.endSession();
    }
  }

  if (action === 'removeStudent') {
    const triggerStudent = targetStudent;

    if (triggerStudent.projectId) {
      await Project.findByIdAndUpdate(triggerStudent.projectId, { $set: { supervisorId: null } });
      await User.updateMany(
        { projectId: triggerStudent.projectId },
        {
          $set: {
            supervisorId: null,
            status: 'Unassigned',
            projectTitle: '',
            projectDesc: '',
            pdfUrl: '',
            remarks: 'Your team was removed by the supervisor. Please select a new one.',
          },
        }
      );
    } else {
      await User.findByIdAndUpdate(body.studentId, {
        $set: {
          supervisorId: null,
          status: 'Unassigned',
          projectTitle: '',
          projectDesc: '',
          pdfUrl: '',
          remarks: 'You were removed.',
        },
      });
    }
    return NextResponse.json({ message: 'Team removed successfully!' }, { status: 200 });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
