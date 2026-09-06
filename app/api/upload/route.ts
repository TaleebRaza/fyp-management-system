import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getBrowserS3Client, getStorageBucketName } from '../../../lib/s3-client';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import Project from '../../../models/Project';
import {
  buildFineRestriction,
  FINE_RESTRICTION_CODE,
  isFineRestrictionBlocking,
} from '../../../lib/fineRestriction';
import {
  getTeamFineRestriction,
  getTeamFineRestrictionMessage,
} from '../../../lib/teamFineRestriction';
import { requireCurrentUser } from '../../../lib/security/auth';
import { getOrCreateRegistrationPolicy, serializeRegistrationPolicy } from '../../../lib/registrationPolicy';
import {
  areProjectSubmissionsOpen,
  hasPreviousProjectSubmission,
  isProjectComplete,
  isProjectSubmissionPendingReview,
  PROJECT_COMPLETE_CODE,
  PROJECT_COMPLETE_MESSAGE,
  PROJECT_SUBMISSION_PENDING_REVIEW_MESSAGE,
  PROJECT_SUBMISSIONS_CLOSED_CODE,
  PROJECT_SUBMISSIONS_CLOSED_MESSAGE,
} from '../../../lib/projectSubmissionPolicy';
import { consumeRateLimitDimensions } from '../../../lib/rateLimit';
import {
  cancelUploadReservation,
  reserveUpload,
  StorageProtocolError,
} from '../../../lib/storageProtocol';
import { buildStorageKey } from '../../../lib/storageValidation';

const MAX_FILE_SIZE = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication token missing or invalid.' },
        { status: 401 }
      );
    }

    const submissionPolicy = serializeRegistrationPolicy(await getOrCreateRegistrationPolicy());
    const submissionsOpen = areProjectSubmissionsOpen(submissionPolicy);

    if (!submissionsOpen && currentUser.role !== 'student') {
      return NextResponse.json(
        { code: PROJECT_SUBMISSIONS_CLOSED_CODE, error: PROJECT_SUBMISSIONS_CLOSED_MESSAGE },
        { status: 403 }
      );
    }

    const rateLimit = await consumeRateLimitDimensions('pdf-upload', currentUser.id, req.headers, 20);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many upload requests. Please try again later.' }, { status: 429 });
    }

    await connectToDatabase();

    if (currentUser.role === 'student') {
    const student = await User.findOne({ _id: currentUser.id, role: 'student' })
      .select(
        '_id lateRegistrationDays lateRegistrationFine lateRegistrationFineStatus registrationPunishment'
      )
      .lean();
    if (!student) {
      return NextResponse.json({ error: 'Student account not found.' }, { status: 404 });
    }

    const project = await Project.findOne({ members: student._id })
      .select('_id version stage status')
      .lean();

    if (isProjectComplete(project)) {
      return NextResponse.json(
        { code: PROJECT_COMPLETE_CODE, error: PROJECT_COMPLETE_MESSAGE },
        { status: 403 }
      );
    }

    if (isProjectSubmissionPendingReview(project)) {
      return NextResponse.json(
        { error: PROJECT_SUBMISSION_PENDING_REVIEW_MESSAGE },
        { status: 409 }
      );
    }

    if (!submissionsOpen) {
      if (!hasPreviousProjectSubmission(project)) {
        return NextResponse.json(
          { code: PROJECT_SUBMISSIONS_CLOSED_CODE, error: PROJECT_SUBMISSIONS_CLOSED_MESSAGE },
          { status: 403 }
        );
      }
    }

    const fineRestriction = buildFineRestriction(student);
    const teamFineRestriction = await getTeamFineRestriction(project?._id, student._id);
    const fineRestrictions = teamFineRestriction
      ? serializeRegistrationPolicy(await getOrCreateRegistrationPolicy()).fineRestrictions
      : null;
    if (
      teamFineRestriction &&
      isFineRestrictionBlocking(teamFineRestriction, fineRestrictions?.proposalUpload)
    ) {
      return NextResponse.json(
        {
          code: FINE_RESTRICTION_CODE,
          error: getTeamFineRestrictionMessage(teamFineRestriction, 'uploads'),
          fineRestriction,
          teamFineRestriction,
        },
        { status: 403 }
      );
    }
  }

    const { filename, contentType, fileSize, idempotencyKey } = await req.json();
    if (!Number.isSafeInteger(Number(fileSize)) || Number(fileSize) <= 0) {
      return NextResponse.json({ error: 'A valid file size is required.' }, { status: 400 });
    }
    if (Number(fileSize) > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 4MB limit.' }, { status: 400 });
    }
    if (contentType !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Security Violation: Invalid file type.' },
        { status: 400 }
      );
    }
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
      return NextResponse.json({ error: 'A valid upload idempotency key is required.' }, { status: 400 });
    }

    if (String(filename || '').length > 120) {
      return NextResponse.json({ error: 'Filename is too long.' }, { status: 400 });
    }
    const key = buildStorageKey('pdf', currentUser.id, idempotencyKey);
    const reservation = await reserveUpload({
      key,
      ownerId: currentUser.id,
      kind: 'pdf',
      expectedBytes: Number(fileSize),
      expectedContentType: contentType,
      idempotencyKey,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    const command = new PutObjectCommand({
      Bucket: getStorageBucketName(),
      Key: key,
      ContentType: contentType,
    });
    let uploadUrl: string;
    try {
      uploadUrl = await getSignedUrl(getBrowserS3Client(), command, { expiresIn: 120 });
    } catch (error) {
      await cancelUploadReservation(key, currentUser.id, 'signing-failed');
      throw error;
    }
    return NextResponse.json({ uploadUrl, url: key, reservationId: String(reservation._id) });
  } catch (error) {
    console.error('pdf_upload_url_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: 'Server token generation routing aborted.' },
      { status: 500 }
    );
  }
}
