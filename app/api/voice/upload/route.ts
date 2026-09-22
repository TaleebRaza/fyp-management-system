// app/api/voice/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BUCKET_NAME, getS3Client } from '../../../../lib/s3-client';
import connectToDatabase from '../../../../lib/mongodb';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { consumeRateLimitDimensions } from '../../../../lib/rateLimit';
import {
  cancelUploadReservation,
  reserveUpload,
  StorageProtocolError,
} from '../../../../lib/storageProtocol';
import { buildStorageStagingKey } from '../../../../lib/storageValidation';
import { APP_SETTINGS } from '../../../../config/appSettings';
import { isRecord } from '../../../../lib/security/input';

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimit = await consumeRateLimitDimensions('voice-upload', currentUser.id, req.headers, 30);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many upload requests. Please try again later.' }, { status: 429 });
    }

    await connectToDatabase();
    
    const body: unknown = await req.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 });
    }
    const { contentType, fileSize, projectId, idempotencyKey, purpose } = body;
    const isStudentMessage = purpose === 'student-message';

    if (contentType !== APP_SETTINGS.STUDENT_MESSAGE.AUDIO_CONTENT_TYPE) {
      return NextResponse.json({ error: 'Audio uploads must use the audio/webm format.' }, { status: 400 });
    }

    if (
      !Number.isSafeInteger(Number(fileSize))
      || Number(fileSize) <= 0
      || Number(fileSize) > APP_SETTINGS.STUDENT_MESSAGE.MAX_AUDIO_BYTES
    ) {
      return NextResponse.json({ error: 'Audio upload exceeds the 1 MiB limit.' }, { status: 400 });
    }
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
      return NextResponse.json({ error: 'A valid upload idempotency key is required.' }, { status: 400 });
    }

    if (projectId) {
      return NextResponse.json({ error: 'Project-scoped audio uploads are no longer supported.' }, { status: 410 });
    }

    if (isStudentMessage && currentUser.role !== 'student' && currentUser.role !== 'admin' && currentUser.role !== 'supervisor') {
      return NextResponse.json({ error: 'Student or staff access required.' }, { status: 401 });
    }
    if (!isStudentMessage && currentUser.role !== 'supervisor') {
      return NextResponse.json({ error: 'Supervisor access required for broadcast audio.' }, { status: 401 });
    }

    const kind = isStudentMessage ? 'student-message' : 'broadcast';
    const reservation = await reserveUpload({
      key: isStudentMessage
        ? (messageId) => buildStorageStagingKey('student-message', currentUser.id, messageId)
        : buildStorageStagingKey(kind, currentUser.id, idempotencyKey),
      ownerId: currentUser.id,
      kind,
      expectedBytes: Number(fileSize),
      expectedContentType: contentType,
      idempotencyKey,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000),
    });

    // 4. Create Presigned URL strictly for this specific key
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: reservation.key,
      ContentType: APP_SETTINGS.STUDENT_MESSAGE.AUDIO_CONTENT_TYPE,
      ContentLength: Number(fileSize),
    });

    let uploadUrl: string;
    try {
      uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 60 });
    } catch (error) {
      await cancelUploadReservation(reservation.key, currentUser.id, 'signing-failed');
      throw error;
    }

    return NextResponse.json({ uploadUrl, key: reservation.key, reservationId: String(reservation._id) });
  } catch (error) {
    console.error('voice_upload_url_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to generate secure upload route' }, { status: 500 });
  }
}
