// app/api/voice/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BUCKET_NAME, getS3Client } from '../../../../lib/s3-client';
import connectToDatabase from '../../../../lib/mongodb';
import { hasProjectAccess, requireCurrentUser } from '../../../../lib/security/auth';
import { consumeRateLimitDimensions } from '../../../../lib/rateLimit';
import {
  cancelUploadReservation,
  reserveUpload,
  StorageProtocolError,
} from '../../../../lib/storageProtocol';
import { buildStorageKey } from '../../../../lib/storageValidation';

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
    
    const { contentType, fileSize, projectId, idempotencyKey } = await req.json();

    if (contentType !== 'audio/webm') {
      return NextResponse.json({ error: 'Voice notes must use the audio/webm format.' }, { status: 400 });
    }

    // 2. Strict 1MB size limit for voice notes
    if (!Number.isSafeInteger(Number(fileSize)) || Number(fileSize) <= 0 || Number(fileSize) > 1 * 1024 * 1024) {
      return NextResponse.json({ error: 'Voice note exceeds 1MB limit.' }, { status: 400 });
    }
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
      return NextResponse.json({ error: 'A valid upload idempotency key is required.' }, { status: 400 });
    }

    const isVoiceNote = Boolean(projectId);
    if (isVoiceNote && !await hasProjectAccess(currentUser, String(projectId))) {
      return NextResponse.json({ error: 'Project not found or access denied.' }, { status: 403 });
    }

    if (!isVoiceNote && currentUser.role !== 'supervisor') {
      return NextResponse.json({ error: 'Project ID required for voice notes.' }, { status: 400 });
    }

    const kind = isVoiceNote ? 'voice' : 'broadcast';
    const key = buildStorageKey(kind, currentUser.id, idempotencyKey, isVoiceNote ? String(projectId) : undefined);
    const reservation = await reserveUpload({
      key,
      ownerId: currentUser.id,
      kind,
      projectId: isVoiceNote ? String(projectId) : undefined,
      expectedBytes: Number(fileSize),
      expectedContentType: contentType,
      idempotencyKey,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000),
    });

    // 4. Create Presigned URL strictly for this specific key
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType || 'audio/webm',
    });

    // Generate a URL that self-destructs in 60 seconds
    let uploadUrl: string;
    try {
      uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 60 });
    } catch (error) {
      await cancelUploadReservation(key, currentUser.id, 'signing-failed');
      throw error;
    }

    return NextResponse.json({ uploadUrl, key, reservationId: String(reservation._id) });
  } catch (error) {
    console.error('voice_upload_url_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to generate secure upload route' }, { status: 500 });
  }
}
