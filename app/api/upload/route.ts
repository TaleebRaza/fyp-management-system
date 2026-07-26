import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { s3Client, BUCKET_NAME, MAX_STORAGE_BYTES } from '../../../lib/s3-client';
import connectToDatabase from '../../../lib/mongodb';
import SystemConfig from '../../../models/SystemConfig';
import User from '../../../models/User';
import { buildFineRestriction, FINE_RESTRICTION_CODE } from '../../../lib/fineRestriction';
import {
  getTeamFineRestriction,
  getTeamFineRestrictionMessage,
} from '../../../lib/teamFineRestriction';
import { requireCurrentUser } from '../../../lib/security/auth';

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

    await connectToDatabase();

    if (currentUser.role === 'student') {
    const student = await User.findOne({ _id: currentUser.id, role: 'student' })
      .select(
        '_id projectId lateRegistrationDays lateRegistrationFine lateRegistrationFineStatus registrationPunishment'
      )
      .lean();
    if (!student) {
      return NextResponse.json({ error: 'Student account not found.' }, { status: 404 });
    }

    const fineRestriction = buildFineRestriction(student);
    const teamFineRestriction = await getTeamFineRestriction(student.projectId, student._id);
    if (teamFineRestriction) {
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

  const config = await SystemConfig.findOne({ configKey: 'storage' });
    if (config && config.usedBytes >= MAX_STORAGE_BYTES) {
      return NextResponse.json({ error: 'System storage capacity reached.' }, { status: 403 });
    }

    const { filename, contentType, fileSize } = await req.json();
    if (!Number.isFinite(Number(fileSize)) || Number(fileSize) <= 0) {
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

    const sanitizedCleanName =
      String(filename || 'document.pdf').replace(/[^a-zA-Z0-9.-]/g, '_') || 'document.pdf';
    const key = `proposals/${currentUser.id}/${crypto.randomUUID()}-${sanitizedCleanName}`;
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 120 });
    return NextResponse.json({ uploadUrl, url: key });
  } catch (error) {
    console.error('Client Upload Token Generation Handshake Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Server token generation routing aborted.' },
      { status: 500 }
    );
  }
}
