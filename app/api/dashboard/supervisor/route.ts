import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import mongoose, { ClientSession } from 'mongoose';
import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../../../../config/projectDomains';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { createInviteCode } from '../../../../lib/security/inviteCode';
import { isRecord, normalizeText } from '../../../../lib/security/input';
import { DEFAULT_TEAM_SIZE, EXPANDED_TEAM_SIZE, getTeamCapacity } from '../../../../lib/teamCapacity';
import { reviewProject } from '../../../../lib/projectReview';
import { isProjectReviewStatus } from '../../../../lib/projectReviewPolicy';
import {
  capacityReservationError,
  releaseSupervisorProjectSlot,
  reserveSupervisorProjectSlot,
} from '../../../../lib/supervisorCapacity';

export const dynamic = 'force-dynamic';

async function createProjectWithUniqueInviteCode(projectData: Record<string, unknown>, session: ClientSession) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const inviteCode = createInviteCode();
      const project = new Project({ ...projectData, inviteCode });
      await project.save({ session });
      return project;
    } catch (error) {
      if ((error as { code?: unknown }).code !== 11000) throw error;
    }
  }

  throw new Error('Failed to generate a unique project invite code.');
}

export async function GET(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['supervisor']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized supervisor request.' }, { status: 401 });
  }

  try {
    const students = await User.find({ role: 'student', supervisorId: currentUser.id })
      .select('_id name rollNo email program batch semester projectId projectTitle projectDesc domain domains tools pdfUrl status remarks')
      .lean();
    const supervisor = await User.findById(currentUser.id).select('+migrationCode').lean();

    // Fetch associated projects to get the timeline stage.
    const projectIds = students.map(s => s.projectId).filter(Boolean);
    const projects = projectIds.length > 0
      ? await Project.find({ _id: { $in: projectIds } })
          .select('_id stage maxTeamSize domains domain')
          .lean()
      : [];
    const projectMetadata = projects.reduce<Record<string, { stage: string; maxTeamSize: number; domains: string[]; domain: string }>>((acc, p) => {
      const domainIds = normalizeProjectDomainIds(p.domains, p.domain);

      acc[p._id.toString()] = {
        stage: p.stage,
        maxTeamSize: getTeamCapacity(p.maxTeamSize),
        domains: domainIds,
        domain: formatProjectDomainLabels(domainIds, p.domain),
      };
      return acc;
    }, {});
    // --------------------------------------------------------------

    const projectMap = new Map();

    students.forEach((student) => {
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
          stage: projectMetadata[pId]?.stage || 'PROPOSAL',
          maxTeamSize: projectMetadata[pId]?.maxTeamSize || DEFAULT_TEAM_SIZE,
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

    return NextResponse.json(
      { projects: Array.from(projectMap.values()), migrationCode: supervisor?.migrationCode || '' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Supervisor Dashboard GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['supervisor']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized supervisor request.' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    
    // Read the body once only. Reading req.json() twice breaks migration.
    const body: unknown = await req.json();
    if (!isRecord(body)) return NextResponse.json({ error: 'Invalid supervisor action.' }, { status: 400 });
    const { action, studentId, status, remarks, migrationCode, projectId } = body;
    if (!['updateStatus', 'migrate', 'removeStudent', 'expandTeam'].includes(String(action))) {
      return NextResponse.json({ error: 'Unknown supervisor action.' }, { status: 400 });
    }

    if (action === 'updateStatus') {
      const requestedStudentId = normalizeText(studentId, 64);
      if (!mongoose.Types.ObjectId.isValid(requestedStudentId) || !isProjectReviewStatus(status)) {
        return NextResponse.json({ error: 'Invalid project review request.' }, { status: 400 });
      }

      const result = await reviewProject({
        studentId: requestedStudentId,
        status,
        remarks: normalizeText(remarks, 2000) || 'No remarks provided.',
        supervisorId: currentUser.id,
        actorId: currentUser.id,
      });

      if (!result.success) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }

      return NextResponse.json({ message: 'Status updated and timeline advanced!' }, { status: 200 });
    }

    if (action === 'migrate') {
      const requestedStudentId = String(studentId || '').trim();
      const requestedMigrationCode = normalizeText(migrationCode, 32).toUpperCase();

      if (!mongoose.Types.ObjectId.isValid(requestedStudentId)) {
        return NextResponse.json({ error: 'Invalid student selected.' }, { status: 400 });
      }

      if (!requestedMigrationCode) {
        return NextResponse.json({ error: 'Migration code is required.' }, { status: 400 });
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      const fail = async (message: string, statusCode: number) => {
        await session.abortTransaction();
        session.endSession();
        return NextResponse.json({ error: message }, { status: statusCode });
      };

      try {
        const targetSup = await User.findOne({
          role: 'supervisor',
          migrationCode: requestedMigrationCode,
        })
          .select('_id name')
          .session(session);

        if (!targetSup) {
          return await fail('Invalid Migration Code!', 400);
        }

        const studentInTx = await User.findOne({
          _id: requestedStudentId,
          role: 'student',
          supervisorId: currentUser.id,
        }).session(session);
        if (!studentInTx) {
          return await fail('Student not found.', 404);
        }

        if (String(studentInTx.supervisorId || '') === String(targetSup._id)) {
          return await fail('This student is already assigned to the target supervisor.', 400);
        }

        const reservation = await reserveSupervisorProjectSlot(targetSup._id, session);
        if (reservation !== 'reserved') {
          return await fail(capacityReservationError(reservation), reservation === 'missing' ? 404 : 409);
        }

        const oldProject = studentInTx.projectId
          ? await Project.findOne({ _id: studentInTx.projectId, supervisorId: currentUser.id }).session(session)
          : null;

        if (studentInTx.projectId && !oldProject) {
          return await fail('Project not found.', 404);
        }

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
              stage: 'PROPOSAL',
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
            projectMembers.every((member: unknown) => String(member) === String(studentInTx._id));

          if (isOnlyMember) {
            const inheritedDomainIds = normalizeProjectDomainIds(
              oldProject.domains?.length ? oldProject.domains : studentInTx.domains,
              oldProject.domain || studentInTx.domain
            );
            const inheritedDomainText = formatProjectDomainLabels(
              inheritedDomainIds,
              oldProject.domain || studentInTx.domain
            );

            if (!await releaseSupervisorProjectSlot(currentUser.id, session)) {
              return await fail('Unable to release the previous supervisor capacity.', 409);
            }
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
                stage: oldProject.stage || 'PROPOSAL',
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

        await session.commitTransaction();
        session.endSession();

        return NextResponse.json({ message: 'Student migrated successfully. Project status and timeline were preserved.' }, { status: 200 });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Migration transaction error:', error);
        return NextResponse.json({ error: 'Migration failed. Please try again.' }, { status: 500 });
      }
    }

    if (action === 'removeStudent') {
      const requestedStudentId = String(studentId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(requestedStudentId)) {
        return NextResponse.json({ error: 'Invalid student selected.' }, { status: 400 });
      }

      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const triggerStudent = await User.findOne({
          _id: requestedStudentId,
          role: 'student',
          supervisorId: currentUser.id,
        }).session(session);
        if (!triggerStudent) {
          await session.abortTransaction();
          return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
        }

        if (triggerStudent.projectId) {
          const project = await Project.findOne({
            _id: triggerStudent.projectId,
            supervisorId: currentUser.id,
          }).session(session);
          if (!project) {
            await session.abortTransaction();
            return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
          }
          if (!await releaseSupervisorProjectSlot(currentUser.id, session)) {
            await session.abortTransaction();
            return NextResponse.json({ error: 'Unable to release supervisor capacity.' }, { status: 409 });
          }
          project.supervisorId = null;
          await project.save({ session });
          await User.updateMany(
            { projectId: project._id, role: 'student', supervisorId: currentUser.id },
            { $set: {
              supervisorId: null,
              status: 'Unassigned',
              projectTitle: '',
              projectDesc: '',
              pdfUrl: '',
              remarks: 'Your team was removed by the supervisor. Please select a new one.',
            } },
            { session, runValidators: true }
          );
        } else {
          await User.updateOne(
            { _id: requestedStudentId, role: 'student', supervisorId: currentUser.id },
            { $set: { supervisorId: null, status: 'Unassigned', projectTitle: '', projectDesc: '', pdfUrl: '', remarks: 'You were removed.' } },
            { session, runValidators: true }
          );
        }

        await session.commitTransaction();
        return NextResponse.json({ message: 'Team removed successfully.' }, { status: 200 });
      } catch {
        if (session.inTransaction()) await session.abortTransaction();
        console.error('supervisor_removal_failed');
        return NextResponse.json({ error: 'Failed to remove team.' }, { status: 500 });
      } finally {
        session.endSession();
      }
    }

    if (action === 'expandTeam') {
      const requestedProjectId = String(projectId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(requestedProjectId)) {
        return NextResponse.json({ error: 'Invalid project selected.' }, { status: 400 });
      }

      const expandedProject = await Project.findOneAndUpdate(
        { _id: requestedProjectId, supervisorId: currentUser.id },
        { $set: { maxTeamSize: EXPANDED_TEAM_SIZE } },
        { new: true }
      );

      if (!expandedProject) {
        return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      }

      return NextResponse.json(
        { message: 'This team can now add a third member.' },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('Supervisor Action Error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
