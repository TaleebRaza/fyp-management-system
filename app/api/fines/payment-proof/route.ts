import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextRequest, NextResponse } from 'next/server';

import { consumeRateLimitDimensions } from '../../../../lib/rateLimit';
import { BUCKET_NAME, getS3Client } from '../../../../lib/s3-client';
import { requireCurrentUser } from '../../../../lib/security/auth';
import {
  cancelUploadReservation,
  reserveUpload,
  StorageProtocolError,
} from '../../../../lib/storageProtocol';
import { buildStorageKey } from '../../../../lib/storageValidation';

const MAX_PROOF_SIZE = 4 * 1024 * 1024;
const PROOF_CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req, ['student'], { allowPaymentOnly: true });
    if (!currentUser) return NextResponse.json({ error: 'Student access is required.' }, { status: 403 });
    const rateLimit = await consumeRateLimitDimensions('fine-proof-upload', currentUser.id, req.headers, 12);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many proof upload requests. Try again later.' }, { status: 429 });
    }

    const body: unknown = await req.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: 'A JSON object is required.' }, { status: 400 });
    }
    const fileSize = Number(body.fileSize);
    const contentType = String(body.contentType || '');
    const idempotencyKey = String(body.idempotencyKey || '').trim();
    if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_PROOF_SIZE) {
      return NextResponse.json({ error: 'Payment proof must be between 1 byte and 4MB.' }, { status: 400 });
    }
    if (!PROOF_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'Payment proof must be a PDF, JPEG, or PNG.' }, { status: 400 });
    }
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
      return NextResponse.json({ error: 'A valid upload idempotency key is required.' }, { status: 400 });
    }

    const key = buildStorageKey('fine-proof', currentUser.id, idempotencyKey);
    const reservation = await reserveUpload({
      key,
      ownerId: currentUser.id,
      kind: 'fine-proof',
      expectedBytes: fileSize,
      expectedContentType: contentType,
      idempotencyKey,
      expiresAt: new Date(Date.now() + 5 * 60 * 1_000),
    });
    const command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, ContentType: contentType });
    let uploadUrl: string;
    try {
      uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 120 });
    } catch (error) {
      await cancelUploadReservation(key, currentUser.id, 'fine-proof-signing-failed');
      throw error;
    }
    return NextResponse.json({ uploadUrl, proofKey: key, reservationId: String(reservation._id) });
  } catch (error) {
    console.error('fine_proof_upload_url_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Unable to prepare payment proof upload.' }, { status: 500 });
  }
}
