import { performance } from 'node:perf_hooks';

import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import connectToDatabase from '../../../../lib/mongodb';
import { progressProjectStage, reviewProject } from '../../../../lib/projectReview';
import {
  getAdminProjectReviewQueue,
  parseAdminProjectReviewCursor,
} from '../../../../lib/projectReviewQueue';
import { isProjectReviewStatus } from '../../../../lib/projectReviewPolicy';
import {
  REGISTRATION_POLICY_KEY,
  getOrCreateRegistrationPolicy,
  serializeRegistrationPolicy,
} from '../../../../lib/registrationPolicy';
import RegistrationPolicy from '../../../../models/RegistrationPolicy';
import {
  invalidatePublicContent,
  PUBLIC_REGISTRATION_POLICY_TAG,
} from '../../../../lib/publicContentCache';
import {
  projectReviewActivityAction,
  recordPortalActivity,
} from '../../../../lib/portalActivityLog';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { isRecord, normalizeText } from '../../../../lib/security/input';
import { JSON_BODY_LIMITS, readBoundedJson } from '../../../../lib/security/request';

export const dynamic = 'force-dynamic';

function parsePositiveInteger(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function formatDuration(value: number) {
  return Math.max(value, 0).toFixed(1);
}

export async function GET(req: NextRequest) {
  const requestStarted = performance.now();
  const authStarted = performance.now();
  const currentUser = await requireCurrentUser(req, ['admin']);
  const authMs = performance.now() - authStarted;

  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    const page = parsePositiveInteger(req.nextUrl.searchParams.get('page'), 1, 1_000);
    const limit = parsePositiveInteger(req.nextUrl.searchParams.get('limit'), 24, 50);
    const search = normalizeText(req.nextUrl.searchParams.get('search'), 120);
    const program = normalizeText(req.nextUrl.searchParams.get('program'), 32);
    const cursor = req.nextUrl.searchParams.get('cursor');
    if (page > 1 && !parseAdminProjectReviewCursor(cursor)) {
      return NextResponse.json({ error: 'A pagination cursor is required for later pages.' }, { status: 400 });
    }

    // requireCurrentUser already establishes the cached MongoDB connection.
    const [result, policyDocument] = await Promise.all([
      getAdminProjectReviewQueue({ page, limit, cursor: cursor || undefined, search, program }),
      getOrCreateRegistrationPolicy(),
    ]);
    const policy = serializeRegistrationPolicy(policyDocument);
    const response = NextResponse.json({
      projects: result.projects,
      pagination: result.pagination,
      nextCursor: result.nextCursor,
      projectSubmissionsOpen: policy.projectSubmissionsOpen,
      projectResetEnabled: policy.projectResetEnabled,
    }, { status: 200 });

    response.headers.set(
      'Server-Timing',
      [
        `auth;dur=${formatDuration(authMs)}`,
        `filter_lookup;dur=${formatDuration(result.timings.filterLookupMs)}`,
        `projects;dur=${formatDuration(result.timings.projectQueryMs)}`,
        `users;dur=${formatDuration(result.timings.userQueryMs)}`,
        `mapping;dur=${formatDuration(result.timings.mappingMs)}`,
        `total;dur=${formatDuration(performance.now() - requestStarted)}`,
      ].join(', ')
    );
    response.headers.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=20');

    return response;
  } catch (error) {
    console.error('Admin project review queue error:', error);
    return NextResponse.json({ error: 'Failed to fetch project review queue.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['admin']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    const json = await readBoundedJson(req, JSON_BODY_LIMITS.form);
    if (!json.ok) return json.response;
    const body = json.value;

    if (!isRecord(body)) {
      return NextResponse.json({ error: 'Invalid review request.' }, { status: 400 });
    }

    const studentId = normalizeText(body.studentId, 64);

    const isProgression = body.action === 'progressStage';
    const requestedStatus = isProjectReviewStatus(body.status) ? body.status : null;
    if (!mongoose.Types.ObjectId.isValid(studentId)
      || (!isProgression && !requestedStatus)) {
      return NextResponse.json({ error: 'Invalid project review request.' }, { status: 400 });
    }

    await connectToDatabase();
    const mutationInput = {
      studentId,
      remarks: normalizeText(body.remarks, 2000) || 'No remarks provided.',
      expectedStage: normalizeText(body.expectedStage, 32),
      expectedVersion: body.expectedVersion,
      approverId: currentUser.id,
    };
    const result = isProgression
      ? await progressProjectStage({ ...mutationInput, ratings: body.ratings })
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
        {
          error: result.reason === 'not-reviewable'
            ? 'This project is no longer waiting for review.'
            : result.reason === 'not-progressable'
              ? 'This project is no longer eligible for stage progression.'
              : 'Project not found.',
        },
        { status: ['not-reviewable', 'not-progressable'].includes(result.reason) ? 409 : 404 }
      );
    }

    const activityAction = isProgression
      ? (result.completed ? 'project-completed' : 'project-stage-progressed')
      : requestedStatus
        ? projectReviewActivityAction(requestedStatus)
        : null;
    if (!activityAction) {
      return NextResponse.json({ error: 'Invalid project review request.' }, { status: 400 });
    }
    await recordPortalActivity({
      action: activityAction,
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });

    return NextResponse.json({
      message: isProgression
        ? (result.completed ? 'Project completed successfully.' : 'Project stage progressed successfully.')
        : 'Document review recorded.',
      completed: result.completed,
      newStage: result.newStage,
    }, { status: 200 });
  } catch (error) {
    console.error('Admin project review error:', error);
    return NextResponse.json({ error: 'Failed to review project.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['admin']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    const json = await readBoundedJson(req, JSON_BODY_LIMITS.control);
    if (!json.ok) return json.response;
    const body = json.value;

    if (!isRecord(body) ||
      (!('projectSubmissionsOpen' in body) && !('projectResetEnabled' in body)) ||
      ('projectSubmissionsOpen' in body && typeof body.projectSubmissionsOpen !== 'boolean') ||
      ('projectResetEnabled' in body && typeof body.projectResetEnabled !== 'boolean')) {
      return NextResponse.json({ error: 'Provide a boolean submission or reset setting.' }, { status: 400 });
    }

    await connectToDatabase();
    const updated = await RegistrationPolicy.findOneAndUpdate(
      { policyKey: REGISTRATION_POLICY_KEY },
      {
        $set: {
          ...(typeof body.projectSubmissionsOpen === 'boolean'
            ? { projectSubmissionsOpen: body.projectSubmissionsOpen } : {}),
          ...(typeof body.projectResetEnabled === 'boolean'
            ? { projectResetEnabled: body.projectResetEnabled } : {}),
          updatedBy: currentUser.id,
        },
        $setOnInsert: { policyKey: REGISTRATION_POLICY_KEY },
        $inc: { version: 1 },
      },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );
    const policy = serializeRegistrationPolicy(updated);
    invalidatePublicContent(PUBLIC_REGISTRATION_POLICY_TAG);

    await recordPortalActivity({
      action: 'admin-project-submissions-updated',
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });

    return NextResponse.json({
      message: 'Project controls updated.',
      projectSubmissionsOpen: policy.projectSubmissionsOpen,
      projectResetEnabled: policy.projectResetEnabled,
    });
  } catch (error) {
    console.error('Admin project submission control error:', error);
    return NextResponse.json({ error: 'Failed to update project submission control.' }, { status: 500 });
  }
}
