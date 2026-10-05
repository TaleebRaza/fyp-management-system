import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import mongoose from 'mongoose';
import { normalizeProjectDomainIds } from '../../../../config/projectDomains';
import { EXPANDED_TEAM_SIZE } from '../../../../config/appSettings';
import { parseProjectRatingValues } from '../../../../config/projectRatings';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { createProjectWithUniqueInviteCode } from '../../../../lib/projectCreation';
import { isRecord, normalizeText } from '../../../../lib/security/input';
import { JSON_BODY_LIMITS, readBoundedJson } from '../../../../lib/security/request';
import { progressProjectStage, reviewProject } from '../../../../lib/projectReview';
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
import {
  getSupervisorDashboard,
  SUPERVISOR_DASHBOARD_AUTH_FIELDS,
  type SupervisorDashboardFields,
} from '../../../../lib/features/supervisor/dashboard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const currentUser = await requireCurrentUser<SupervisorDashboardFields>(
    req,
    ['supervisor'],
    SUPERVISOR_DASHBOARD_AUTH_FIELDS
  );
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized supervisor request.' }, { status: 401 });
  }
  try {
    return NextResponse.json(await getSupervisorDashboard(currentUser), { status: 200 });
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

    // Read the body once so every action shares the same byte limit.
    const json = await readBoundedJson(req, JSON_BODY_LIMITS.form);
    if (!json.ok) return json.response;
    const body = json.value;
    if (!isRecord(body)) return NextResponse.json({ error: 'Invalid supervisor action.' }, { status: 400 });
    const { action, studentId, status, remarks, expectedStage, expectedVersion, ratings, migrationCode, projectId, ratingRound } = body;
    if (!['updateStatus', 'progressStage', 'updateRating', 'migrate', 'removeStudent', 'expandTeam'].includes(String(action))) {
      return NextResponse.json({ error: 'Unknown supervisor action.' }, { status: 400 });
    }

    if (action === 'updateRating') {
      const requestedStudentId = normalizeText(studentId, 64);
      const requestedRound = String(ratingRound || '').trim();
      const parsedRatings = parseProjectRatingValues(ratings);

      if (!mongoose.Types.ObjectId.isValid(requestedStudentId) || !['proposal', 'thesis'].includes(requestedRound) || !parsedRatings) {
        return NextResponse.json({ error: 'Invalid rating update.' }, { status: 400 });
      }

      const targetProject = await Project.findOne({
        members: requestedStudentId,
        supervisorId: currentUser.id,
      }).select('_id stage version ratings reviewRemarks pdfUrl').lean();

      if (!targetProject || !targetProject.ratings || !targetProject.ratings[requestedRound]) {
        return NextResponse.json({ error: 'Saved rating not found.' }, { status: 404 });
      }

      const snapshot = targetProject.ratings[requestedRound] as Record<string, unknown>;
      const updateResult = await Project.updateOne(
        {
          _id: targetProject._id,
          supervisorId: currentUser.id,
          members: requestedStudentId,
        },
        {
          $set: {
            [`ratings.${requestedRound}`]: {
              ...parsedRatings,
              ratedAt: snapshot.ratedAt || new Date(),
              ratedBy: snapshot.ratedBy || currentUser.id,
            },
            reviewRemarks: normalizeText(remarks, 2000) || 'No remarks provided.',
          },
        },
        { runValidators: true }
      );

      if (updateResult.matchedCount !== 1) {
        return NextResponse.json({ error: 'Saved rating not found.' }, { status: 404 });
      }

      return NextResponse.json({
        message: 'Rating updated successfully.',
        rating: {
          ...parsedRatings,
          ratedAt: snapshot.ratedAt || new Date().toISOString(),
          ratedBy: snapshot.ratedBy || currentUser.id,
        },
      }, { status: 200 });
    }

    if (action === 'updateStatus' || action === 'progressStage') {
      const requestedStudentId = normalizeText(studentId, 64);
      const requestedStatus = isProjectReviewStatus(status) ? status : null;
      if (!mongoose.Types.ObjectId.isValid(requestedStudentId)
        || (action === 'updateStatus' && !requestedStatus)) {
        return NextResponse.json({ error: 'Invalid project review request.' }, { status: 400 });
      }

      const mutationInput = {
        studentId: requestedStudentId,
        remarks: normalizeText(remarks, 2000) || 'No remarks provided.',
        expectedStage: normalizeText(expectedStage, 32),
        expectedVersion,
        approverId: currentUser.id,
        supervisorId: currentUser.id,
      };
      const result = action === 'progressStage'
        ? await progressProjectStage({ ...mutationInput, ratings })
        : requestedStatus
          ? await reviewProject({ ...mutationInput, status: requestedStatus })
          : { success: false as const, reason: 'invalid-request' as const };

      if (!result.success) {
        const invalidMessage = result.reason === 'invalid-request'
          ? 'The project stage or version is invalid.'
          : result.reason === 'ratings-required'
            ? 'All three ratings must be whole numbers from 1 through 10.'
            : result.reason === 'ratings-not-allowed'
              ? 'Ratings are only accepted when progressing a Proposal or Thesis stage.'
              : null;
        if (invalidMessage) {
          return NextResponse.json(
            { error: invalidMessage },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: result.reason === 'not-reviewable'
            ? 'This project review is stale or no longer pending.'
            : result.reason === 'not-progressable'
              ? 'This project is no longer eligible for stage progression.'
              : 'Project not found.' },
          { status: ['not-reviewable', 'not-progressable'].includes(result.reason) ? 409 : 404 }
        );
      }

      const activityAction = action === 'progressStage'
        ? (result.completed ? 'project-completed' : 'project-stage-progressed')
        : requestedStatus
          ? projectReviewActivityAction(requestedStatus)
          : null;
      if (activityAction) await recordCurrentUserActivity(activityAction, currentUser);

      return NextResponse.json({
        message: action === 'progressStage'
          ? (result.completed ? 'Project completed successfully.' : 'Project stage progressed successfully.')
          : 'Document review recorded.',
        ...(result.success ? { completed: result.completed, newStage: result.newStage } : {}),
      }, { status: 200 });
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
        if (String(targetSup._id) === String(currentUser.id)) {
          return await fail('This project is already assigned to you.', 400);
        }

        const studentInTx = await User.findOne({
          _id: requestedStudentId,
          role: 'student',
        }).session(session);

        if (!studentInTx) {
          return await fail('Student not found.', 404);
        }

        const oldProject = await Project.findOne({
          members: studentInTx._id,
          supervisorId: currentUser.id,
        }).session(session);

        if (!oldProject) {
          return await fail('Project not found.', 404);
        }

        const reservation = await reserveSupervisorProjectSlot(targetSup._id, session);
        if (reservation !== 'reserved') {
          return await fail(
            capacityReservationError(reservation),
            reservation === 'missing' ? 404 : 409
          );
        }

        const domainIds = normalizeProjectDomainIds(oldProject.domains);
        const members = Array.isArray(oldProject.members) ? oldProject.members : [];
        const isOnlyMember =
          members.length <= 1 ||
          members.every((member: unknown) => String(member) === String(studentInTx._id));

        if (isOnlyMember) {
          if (!await releaseSupervisorProjectSlot(currentUser.id, session)) {
            return await fail('Unable to release the previous supervisor capacity.', 409);
          }

          oldProject.supervisorId = targetSup._id;
          oldProject.domains = domainIds;
          await oldProject.save({ session });
} else {
          await Project.findByIdAndUpdate(
            oldProject._id,
            { $pull: { members: studentInTx._id } },
            { session }
          );

          await createProjectWithUniqueInviteCode(
            {
              supervisorId: targetSup._id,
              members: [studentInTx._id],
              stage: oldProject.stage || 'PROPOSAL',
              status: oldProject.status || 'Pending',
              title: oldProject.title || '',
              description: oldProject.description || '',
              titleFingerprint: oldProject.titleFingerprint || '',
              domains: domainIds,
              tools: oldProject.tools || '',
              reviewRemarks: oldProject.reviewRemarks || '',
              ratings: oldProject.ratings,
              pdfUrl: '',
              pdfSize: 0,
            },
            session
          );
}

        await session.commitTransaction();
        session.endSession();

        await recordCurrentUserActivity('supervisor-student-migrated', currentUser);
        return NextResponse.json(
          { message: 'Student migrated successfully. Project status and timeline were preserved.' },
          { status: 200 }
        );
      } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        session.endSession();
        console.error('Migration transaction error:', error);
        return NextResponse.json(
          { error: 'Migration failed. Please try again.' },
          { status: 500 }
        );
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
        }).session(session);

        if (!triggerStudent) {
          await session.abortTransaction();
          return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
        }

        const project = await Project.findOne({
          members: triggerStudent._id,
          supervisorId: currentUser.id,
        }).session(session);

        if (!project) {
          await session.abortTransaction();
          return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
        }

        if (!await releaseSupervisorProjectSlot(currentUser.id, session)) {
          await session.abortTransaction();
          return NextResponse.json(
            { error: 'Unable to release supervisor capacity.' },
            { status: 409 }
          );
        }

        project.supervisorId = null;
        await project.save({ session });
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
        { returnDocument: 'after' }
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
