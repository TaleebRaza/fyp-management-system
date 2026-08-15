import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import mongoose from 'mongoose';
import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../../../../config/projectDomains';
import { DEFAULT_TEAM_SIZE, EXPANDED_TEAM_SIZE, getTeamCapacity } from '../../../../config/appSettings';
import { getSafeProjectRatings } from '../../../../config/projectRatings';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { createProjectWithUniqueInviteCode } from '../../../../lib/projectCreation';
import { isRecord, normalizeText } from '../../../../lib/security/input';
import { reviewProject } from '../../../../lib/projectReview';
import { isProjectReviewStatus } from '../../../../lib/projectReviewPolicy';
import {
  capacityReservationError,
  releaseSupervisorProjectSlot,
  reserveSupervisorProjectSlot,
} from '../../../../lib/supervisorCapacity';
import {
  projectReviewActivityAction,
  recordCurrentUserActivity,
} from '../../../../lib/portalActivityLog';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['supervisor']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized supervisor request.' }, { status: 401 });
  }
  try {
    const [projects, supervisor] = await Promise.all([
      Project.find({ supervisorId: currentUser.id })
        .select('_id members title description domain domains tools pdfUrl status reviewRemarks stage version ratings maxTeamSize')
        .lean(),
      User.findById(currentUser.id).select('+migrationCode').lean(),
    ]);

    type SupervisorProjectRow = {
      _id: unknown;
      members?: unknown[];
      title?: string;
      description?: string;
      domain?: string;
      domains?: unknown;
      tools?: string;
      pdfUrl?: string;
      status?: string;
      reviewRemarks?: string;
      stage?: string;
      version?: number;
      ratings?: unknown;
      maxTeamSize?: number;
    };

    type SupervisorStudentRow = {
      _id: unknown;
      name?: string;
      rollNo?: string;
      email?: string;
      program?: string;
      batch?: string;
      semester?: string;
    };

    const projectRows = projects as unknown as SupervisorProjectRow[];

    const memberIds = Array.from(new Set(
      projectRows.flatMap((project) =>
        (project.members || []).map((memberId) => String(memberId))
      )
    ));

    const students = memberIds.length > 0
      ? await User.find({ _id: { $in: memberIds }, role: 'student' })
          .select('_id name rollNo email program batch semester')
          .lean()
      : [];

    const studentRows = students as unknown as SupervisorStudentRow[];
    const studentsById = new Map(
      studentRows.map((student) => [String(student._id), student])
    );

    const mappedProjects = projectRows.flatMap((project) => {
      const members = (project.members || []).flatMap((memberId) => {
        const student = studentsById.get(String(memberId));
        return student ? [student] : [];
      });
      const firstMember = members[0];
      if (!firstMember) return [];

      const domainIds = normalizeProjectDomainIds(project.domains, project.domain);
      return [{
        _id: String(project._id),
        triggerStudentId: String(firstMember._id),
        projectTitle: project.title,
        projectDesc: project.description,
        domain: formatProjectDomainLabels(domainIds, project.domain),
        domains: domainIds,
        tools: project.tools,
        pdfUrl: project.pdfUrl,
        status: project.status,
        remarks: project.reviewRemarks,
        stage: project.stage || 'PROPOSAL',
        version: Number(project.version || 0),
        ratings: getSafeProjectRatings(project.ratings),
        maxTeamSize: getTeamCapacity(project.maxTeamSize) || DEFAULT_TEAM_SIZE,
        program: firstMember.program || 'N/A',
        batch: firstMember.batch || 'N/A',
        semester: firstMember.semester || '7th Semester',
        members: members.map((student) => ({
          _id: student._id,
          name: student.name,
          rollNo: student.rollNo,
          email: student.email,
          program: student.program || 'N/A',
        })),
      }];
    });

    return NextResponse.json(
      { projects: mappedProjects, migrationCode: supervisor?.migrationCode || '' },
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
    const { action, studentId, status, remarks, expectedStage, expectedVersion, ratings, migrationCode, projectId } = body;
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
        expectedStage: normalizeText(expectedStage, 32),
        expectedVersion,
        approverId: currentUser.id,
        ratings,
        supervisorId: currentUser.id,
      });

      if (!result.success) {
        const invalidMessage = result.reason === 'invalid-request'
          ? 'The project stage or version is invalid.'
          : result.reason === 'ratings-required'
            ? 'All three ratings must be whole numbers from 1 through 10.'
            : result.reason === 'ratings-not-allowed'
              ? 'Ratings are only allowed when approving a Proposal or Thesis submission.'
              : null;
        if (invalidMessage) {
          return NextResponse.json(
            { error: invalidMessage },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: result.reason === 'not-reviewable' ? 'This project review is stale or no longer pending.' : 'Project not found.' },
          { status: result.reason === 'not-reviewable' ? 409 : 404 }
        );
      }

      await recordCurrentUserActivity(projectReviewActivityAction(status), currentUser);

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

        await recordCurrentUserActivity('supervisor-student-migrated', currentUser);

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
        await recordCurrentUserActivity('supervisor-team-removed', currentUser);
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

      await recordCurrentUserActivity('supervisor-team-expanded', currentUser);

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
