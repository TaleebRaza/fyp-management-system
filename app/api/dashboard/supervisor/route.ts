import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import { sendNotificationEmail } from '../../../../lib/mailer';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '../../../../lib/s3-client';
import SystemConfig from '../../../../models/SystemConfig';
import { reserveSupervisorCapacity } from '../../../../lib/supervisorCapacity';
import { withTransactionRetry } from '../../../../lib/transactionUtils';
import mongoose, { ClientSession } from 'mongoose';
import { DEFAULT_PROJECT_STAGE, PROJECT_STAGES } from '../../../../config/appSettings';
import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../../../../config/projectDomains';

export const dynamic = 'force-dynamic';

const [PROPOSAL_STAGE, THESIS_DRAFT_STAGE, FINAL_DELIVERABLES_STAGE] = PROJECT_STAGES;

type DeletionTarget = {
  key: string;
  size: number;
};

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

async function decrementStorageLedger(bytes: number, session?: ClientSession) {
  if (bytes <= 0) return;

  await SystemConfig.findOneAndUpdate(
    { configKey: 'storage' },
    { $inc: { usedBytes: -bytes } },
    { upsert: true, ...(session ? { session } : {}) }
  );

  await SystemConfig.updateOne(
    { configKey: 'storage', usedBytes: { $lt: 0 } },
    { $set: { usedBytes: 0 } },
    session ? { session } : undefined
  );
}

async function createProjectWithUniqueInviteCode(projectData: any, session: ClientSession) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const project = new Project({ ...projectData, inviteCode });
      await project.save({ session });
      return project;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
  }

  throw new Error('Failed to generate a unique project invite code.');
}

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (token.role !== 'supervisor' && token.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Supervisor ID required' }, { status: 400 });
    }

    if (token.role === 'supervisor' && String(token.id) !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectToDatabase();
    
    const students = await User.find({ role: 'student', supervisorId: id }).lean();

    // Fetch associated projects to get the timeline stage.
    const projectIds = students.map(s => s.projectId).filter(Boolean);
    const projects = await Project.find({ _id: { $in: projectIds } }).lean();
    const projectMetadata = projects.reduce((acc: any, p: any) => {
      const domainIds = normalizeProjectDomainIds(p.domains, p.domain);

      acc[p._id.toString()] = {
        stage: p.stage,
        domains: domainIds,
        domain: formatProjectDomainLabels(domainIds, p.domain),
      };
      return acc;
    }, {});
    // --------------------------------------------------------------

    const projectMap = new Map();

    students.forEach((student: any) => {
      const pId = student.projectId ? student.projectId.toString() : `legacy-${student._id.toString()}`;
      
      if (!projectMap.has(pId)) {
        const metadata = projectMetadata[pId];
        const domainIds = normalizeProjectDomainIds(
          metadata?.domains?.length ? metadata.domains : student.domains,
          metadata?.domain || student.domain
        );
        const domainText = formatProjectDomainLabels(
          domainIds,
          metadata?.domain || student.domain
        );

        projectMap.set(pId, {
          _id: pId, 
          triggerStudentId: student._id.toString(),
          projectTitle: student.projectTitle,
          projectDesc: student.projectDesc,
          domain: domainText,
          domains: domainIds,
          tools: student.tools,
          pdfUrl: student.pdfUrl,
          status: student.status,
          remarks: student.remarks,
          stage: projectMetadata[pId]?.stage || DEFAULT_PROJECT_STAGE,
          program: student.program || 'N/A',
          batch: student.batch || 'N/A',
          semester: student.semester || '7th Semester',
          members: []
        });
      }
      
      projectMap.get(pId).members.push({
        _id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        email: student.email,
        program: student.program || 'N/A'
      });
    });

    return NextResponse.json({ projects: Array.from(projectMap.values()) }, { status: 200 });
  } catch (error) {
    console.error('Supervisor Dashboard GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Read the body once only. Reading req.json() twice breaks migration.
    const { action, studentId, status, remarks, migrationCode } = await req.json();

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (token.role !== 'supervisor' && token.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectToDatabase();

    const isStudentAction = ['updateStatus', 'migrate', 'removeStudent'].includes(action);
    const targetStudent = isStudentAction ? await User.findById(studentId) : null;

    if (isStudentAction && !targetStudent) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (
      token.role === 'supervisor' &&
      targetStudent &&
      String(targetStudent.supervisorId || '') !== String(token.id)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (action === 'updateStatus') {
      const triggerStudent = targetStudent!;

      const teamMembers = triggerStudent.projectId 
        ? await User.find({ projectId: triggerStudent.projectId }) 
        : [triggerStudent];

      let finalStatus = status;
      let newStage: string | undefined = undefined;
      let notificationMessage = `Status: ${status}`;

      // --- NEW: Timeline Progression Logic ---
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

          // --- Storage ledger fix for stage advance cleanup ---
          if (newStage && project.pdfUrl) {
            const target = buildDeletionTarget(project.pdfUrl, project.pdfSize);
            const sameFileUsedElsewhere = await Project.exists({
              _id: { $ne: project._id },
              pdfUrl: project.pdfUrl,
            });

            if (target && !sameFileUsedElsewhere) {
              try {
                await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: target.key }));
                await decrementStorageLedger(target.size);
                console.log(`Timeline advance cleanup: deleted previous stage PDF -> ${target.key}`);
              } catch (e: any) {
                console.error('Failed to wipe old stage PDF:', e.message);
              }
            }
          }
        }
      }
      // ---------------------------------------

      // 1. Update the Users
      await User.updateMany(
        { _id: { $in: teamMembers.map(m => m._id) } },
        { $set: { 
            status: finalStatus, 
            remarks: remarks || notificationMessage,
            // Reset the PDF URL if they advanced a stage, so the form expects a new file
            ...(newStage ? { pdfUrl: '' } : {}) 
          } 
        }
      );

      // 2. Update the Project Document
      if (triggerStudent.projectId) {
        await Project.findByIdAndUpdate(triggerStudent.projectId, { 
          $set: { 
            status: finalStatus,
            // Wipe the URL and reset the size tracking to 0 so the next upload starts clean
            ...(newStage ? { stage: newStage, pdfUrl: '', pdfSize: 0 } : {})
          } 
        });
      }
      
      // 3. Email Notifications (Parallelized for Speed)
      const emailPromises = teamMembers.map(async (member) => {
        if (member.supervisorId && member.email) {
          const supervisor = await User.findById(member.supervisorId);
          if (supervisor && supervisor.notificationsEnabled !== false) {
            const subject = `FYP Project Update: ${newStage ? 'Stage Advanced!' : status}`;
            const primaryColor = status === 'Approved' ? '#10b981' : status === 'Changes Requested' ? '#f59e0b' : '#ef4444'; 
            const bgColor = status === 'Approved' ? '#ecfdf5' : status === 'Changes Requested' ? '#fffbeb' : '#fef2f2';

            const htmlContent = `
              <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: sans-serif;">
                <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
                  <div style="background-color: #18181b; padding: 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 20px;">FYP Portal Notification</h1>
                  </div>
                  <div style="padding: 32px;">
                    <h2 style="margin-top: 0; color: #18181b; font-size: 24px;">Project Updated</h2>
                    <p style="color: #71717a; margin-bottom: 24px;">Your supervisor, <strong>${supervisor.name}</strong>, has reviewed your submission.</p>
                    <div style="text-align: center; margin-bottom: 24px;">
                      <span style="display: inline-block; background-color: ${bgColor}; color: ${primaryColor}; padding: 8px 16px; border-radius: 999px; font-weight: bold;">
                        ${notificationMessage}
                      </span>
                    </div>
                    <div style="background-color: #f8fafc; border-left: 4px solid ${primaryColor}; padding: 20px;">
                      <p style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Supervisor Remarks</p>
                      <p style="margin: 0; font-size: 15px; color: #334155; font-style: italic;">"${remarks || 'Proceed to the next stage.'}"</p>
                    </div>
                  </div>
                </div>
              </div>
            `;
            return sendNotificationEmail(member.email, subject, htmlContent);
          }
        }
      });

      // Execute all emails at the exact same time
      await Promise.all(emailPromises);
      return NextResponse.json({ message: 'Status updated and timeline advanced!' }, { status: 200 });
    }

    if (action === 'migrate') {
      const requestedStudentId = String(studentId || '').trim();
      const requestedMigrationCode = String(migrationCode || '').trim().toUpperCase();

      if (!mongoose.Types.ObjectId.isValid(requestedStudentId)) {
        return NextResponse.json({ error: 'Invalid student selected.' }, { status: 400 });
      }

      if (!requestedMigrationCode) {
        return NextResponse.json({ error: 'Migration code is required.' }, { status: 400 });
      }

      const session = await mongoose.startSession();

      const fail = (message: string, statusCode: number) =>
        NextResponse.json({ error: message }, { status: statusCode });

      try {
        return await withTransactionRetry(session, async () => {
        const targetSup = await User.findOne({
          role: 'supervisor',
          migrationCode: requestedMigrationCode,
        })
          .select('_id name extraSlots')
          .session(session);

        if (!targetSup) {
          return await fail('Invalid Migration Code!', 400);
        }

        const studentInTx = await User.findById(requestedStudentId).session(session);
        if (!studentInTx || studentInTx.role !== 'student') {
          return await fail('Student not found.', 404);
        }

        if (
          token.role === 'supervisor' &&
          String(studentInTx.supervisorId || '') !== String(token.id)
        ) {
          return await fail('Forbidden', 403);
        }

        if (String(studentInTx.supervisorId || '') === String(targetSup._id)) {
          return await fail('This student is already assigned to the target supervisor.', 400);
        }

        const capacity = await reserveSupervisorCapacity(String(targetSup._id), session);
        if (capacity.kind === 'missing') {
          return await fail('Invalid Migration Code!', 400);
        }

        if (capacity.kind === 'full') {
          return await fail(`Target supervisor has reached maximum capacity (${capacity.maxSlots} slots).`, 409);
        }

        const oldProject = studentInTx.projectId
          ? await Project.findById(studentInTx.projectId).session(session)
          : null;

        if (!oldProject) {
          const inheritedDomainIds = normalizeProjectDomainIds(
            studentInTx.domains,
            studentInTx.domain
          );
          const inheritedDomainText = formatProjectDomainLabels(
            inheritedDomainIds,
            studentInTx.domain
          );

          const newProject = await createProjectWithUniqueInviteCode(
            {
              supervisorId: targetSup._id,
              members: [studentInTx._id],
              stage: DEFAULT_PROJECT_STAGE,
              status: studentInTx.status || 'Pending',
              title: studentInTx.projectTitle || '',
              titleFingerprint: '',
              domain: inheritedDomainText,
              domains: inheritedDomainIds,
              pdfUrl: studentInTx.pdfUrl || '',
              pdfSize: 0,
            },
            session
          );

          studentInTx.domain = inheritedDomainText;
          studentInTx.domains = inheritedDomainIds;
          studentInTx.supervisorId = targetSup._id;
          studentInTx.projectId = newProject._id;
          studentInTx.status = studentInTx.status || 'Pending';
          studentInTx.remarks = `Migrated to supervisor ${targetSup.name}.`;
          await studentInTx.save({ session });
        } else {
          const projectMembers = Array.isArray(oldProject.members) ? oldProject.members : [];
          const isOnlyMember =
            projectMembers.length <= 1 ||
            projectMembers.every((member: any) => String(member) === String(studentInTx._id));

          if (isOnlyMember) {
            const inheritedDomainIds = normalizeProjectDomainIds(
              oldProject.domains?.length ? oldProject.domains : studentInTx.domains,
              oldProject.domain || studentInTx.domain
            );
            const inheritedDomainText = formatProjectDomainLabels(
              inheritedDomainIds,
              oldProject.domain || studentInTx.domain
            );

            oldProject.supervisorId = targetSup._id;
            oldProject.members = [studentInTx._id];
            oldProject.domain = inheritedDomainText;
            oldProject.domains = inheritedDomainIds;
            await oldProject.save({ session });

            studentInTx.domain = inheritedDomainText;
            studentInTx.domains = inheritedDomainIds;
            studentInTx.supervisorId = targetSup._id;
            studentInTx.projectId = oldProject._id;
            studentInTx.status = oldProject.status || studentInTx.status || 'Pending';
            studentInTx.remarks = `Migrated to supervisor ${targetSup.name}. Project status and timeline were preserved.`;
            await studentInTx.save({ session });
          } else {
            await Project.findByIdAndUpdate(
              oldProject._id,
              { $pull: { members: studentInTx._id } },
              { session }
            );

            const inheritedTitle = oldProject.title || studentInTx.projectTitle || '';
            const inheritedDomainIds = normalizeProjectDomainIds(
              oldProject.domains?.length ? oldProject.domains : studentInTx.domains,
              oldProject.domain || studentInTx.domain
            );
            const inheritedDomain = formatProjectDomainLabels(
              inheritedDomainIds,
              oldProject.domain || studentInTx.domain
            );

            const newProject = await createProjectWithUniqueInviteCode(
              {
                supervisorId: targetSup._id,
                members: [studentInTx._id],
                stage: oldProject.stage || DEFAULT_PROJECT_STAGE,
                status: oldProject.status || studentInTx.status || 'Pending',
                title: inheritedTitle,
                titleFingerprint: oldProject.titleFingerprint || '',
                domain: inheritedDomain,
                domains: inheritedDomainIds,
                // In team migration, keep timeline/status but avoid sharing the old team's file object.
                // The migrated student can upload the next document under the new supervisor.
                pdfUrl: '',
                pdfSize: 0,
              },
              session
            );

            studentInTx.supervisorId = targetSup._id;
            studentInTx.projectId = newProject._id;
            studentInTx.status = oldProject.status || studentInTx.status || 'Pending';
            studentInTx.remarks = `Migrated to supervisor ${targetSup.name}. Project status and timeline were preserved.`;
            studentInTx.projectTitle = inheritedTitle;
            studentInTx.projectDesc = studentInTx.projectDesc || '';
            studentInTx.domain = inheritedDomain;
            studentInTx.domains = inheritedDomainIds;
            studentInTx.tools = studentInTx.tools || '';
            studentInTx.pdfUrl = '';
            await studentInTx.save({ session });
          }
        }

        return NextResponse.json({ message: 'Student migrated successfully. Project status and timeline were preserved.' }, { status: 200 });
        });
      } catch (error) {
        console.error('Migration transaction error:', error);
        return NextResponse.json({ error: 'Migration failed. Please try again.' }, { status: 500 });
      } finally {
        session.endSession();
      }
    }

    if (action === 'removeStudent') {
      const triggerStudent = targetStudent!;

      // --- Team-Aware Removal ---
      if (triggerStudent.projectId) {
        await Project.findByIdAndUpdate(triggerStudent.projectId, { $set: { supervisorId: null } });
        await User.updateMany(
          { projectId: triggerStudent.projectId },
          { $set: {
              supervisorId: null,
              status: 'Unassigned',
              projectTitle: '',
              projectDesc: '',
              pdfUrl: '',
              remarks: 'Your team was removed by the supervisor. Please select a new one.'
            }
          }
        );
      } else {
        await User.findByIdAndUpdate(studentId, {
          $set: { supervisorId: null, status: 'Unassigned', projectTitle: '', projectDesc: '', pdfUrl: '', remarks: 'You were removed.' }
        });
      }
      return NextResponse.json({ message: 'Team removed successfully!' }, { status: 200 });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('Supervisor Action Error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
