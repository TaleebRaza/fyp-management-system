import { performance } from 'node:perf_hooks';

import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import connectToDatabase from '../../../../lib/mongodb';
import { reviewProject } from '../../../../lib/projectReview';
import { getAdminProjectReviewQueue } from '../../../../lib/projectReviewQueue';
import { isProjectReviewStatus } from '../../../../lib/projectReviewPolicy';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { normalizeText } from '../../../../lib/security/input';

export const dynamic = 'force-dynamic';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
    const page = parsePositiveInteger(req.nextUrl.searchParams.get('page'), 1, Number.MAX_SAFE_INTEGER);
    const limit = parsePositiveInteger(req.nextUrl.searchParams.get('limit'), 24, 50);
    const search = normalizeText(req.nextUrl.searchParams.get('search'), 120);
    const program = normalizeText(req.nextUrl.searchParams.get('program'), 32);

    // requireCurrentUser already establishes the cached MongoDB connection.
    const result = await getAdminProjectReviewQueue({ page, limit, search, program });
    const response = NextResponse.json({
      projects: result.projects,
      pagination: result.pagination,
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
  if (!await requireCurrentUser(req, ['admin'])) {
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

    return NextResponse.json({ message: 'Project review recorded.' }, { status: 200 });
  } catch (error) {
    console.error('Admin project review error:', error);
    return NextResponse.json({ error: 'Failed to review project.' }, { status: 500 });
  }
}
