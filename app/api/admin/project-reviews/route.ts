import { performance } from 'node:perf_hooks';

import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import connectToDatabase from '../../../../lib/mongodb';
import { reviewProject } from '../../../../lib/projectReview';
import { getAdminProjectReviewQueue } from '../../../../lib/projectReviewQueue';
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

    // requireCurrentUser already establishes the cached MongoDB connection.
    const [result, policyDocument] = await Promise.all([
      getAdminProjectReviewQueue({ page, limit, search, program }),
      getOrCreateRegistrationPolicy(),
    ]);
    const policy = serializeRegistrationPolicy(policyDocument);
    const response = NextResponse.json({
      projects: result.projects,
      pagination: result.pagination,
      projectSubmissionsOpen: policy.projectSubmissionsOpen,
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
    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid review request.' }, { status: 400 });
    }

    if (!isRecord(body)) {
      return NextResponse.json({ error: 'Invalid review request.' }, { status: 400 });
    }

    const studentId = normalizeText(body.studentId, 64);

    if (!mongoose.Types.ObjectId.isValid(studentId) || !isProjectReviewStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid project review request.' }, { status: 400 });
    }

    await connectToDatabase();
    const result = await reviewProject({
      studentId,
      status: body.status,
      remarks: normalizeText(body.remarks, 2000) || 'No remarks provided.',
      requireAwaitingReview: true,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.reason === 'not-reviewable'
            ? 'This project is no longer waiting for review.'
            : 'Project not found.',
        },
        { status: result.reason === 'not-reviewable' ? 409 : 404 }
      );
    }

    await recordPortalActivity({
      action: projectReviewActivityAction(body.status),
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });

    return NextResponse.json({ message: 'Project review recorded.' }, { status: 200 });
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
    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid submission control request.' }, { status: 400 });
    }

    if (!isRecord(body) || typeof body.projectSubmissionsOpen !== 'boolean') {
      return NextResponse.json({ error: 'Submission status must be open or closed.' }, { status: 400 });
    }

    await connectToDatabase();
    const updated = await RegistrationPolicy.findOneAndUpdate(
      { policyKey: REGISTRATION_POLICY_KEY },
      {
        $set: {
          projectSubmissionsOpen: body.projectSubmissionsOpen,
          updatedBy: currentUser.id,
        },
        $setOnInsert: { policyKey: REGISTRATION_POLICY_KEY },
        $inc: { version: 1 },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const policy = serializeRegistrationPolicy(updated);
    invalidatePublicContent(PUBLIC_REGISTRATION_POLICY_TAG);

    await recordPortalActivity({
      action: 'admin-project-submissions-updated',
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });

    return NextResponse.json({
      message: policy.projectSubmissionsOpen
        ? 'Project submissions are open.'
        : 'Project submissions are closed for all students.',
      projectSubmissionsOpen: policy.projectSubmissionsOpen,
    });
  } catch (error) {
    console.error('Admin project submission control error:', error);
    return NextResponse.json({ error: 'Failed to update project submission control.' }, { status: 500 });
  }
}
