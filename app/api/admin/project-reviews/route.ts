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

export async function GET(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    return NextResponse.json({ projects: await getAdminProjectReviewQueue() }, { status: 200 });
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
        { error: result.reason === 'not-reviewable' ? 'This project is no longer waiting for review.' : 'Project not found.' },
        { status: result.reason === 'not-reviewable' ? 409 : 404 }
      );
    }

    return NextResponse.json({ message: 'Project review recorded.' }, { status: 200 });
  } catch (error) {
    console.error('Admin project review error:', error);
    return NextResponse.json({ error: 'Failed to review project.' }, { status: 500 });
  }
}
