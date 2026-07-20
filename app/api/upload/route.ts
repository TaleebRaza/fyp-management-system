// Replace entire file with:
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { s3Client, BUCKET_NAME, MAX_STORAGE_BYTES } from '../../../lib/s3-client';
import connectToDatabase from '../../../lib/mongodb';
import SystemConfig from '../../../models/SystemConfig';
import { requireRole } from '../../../lib/routeAuth';

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB strict ceiling

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(req, ['student', 'admin']);
    if (auth.kind === 'denied') return auth.response;

    await connectToDatabase();
    
    // 1. Storage Capacity Firewall
    const config = await SystemConfig.findOne({ configKey: 'storage' });
    if (config && config.usedBytes >= MAX_STORAGE_BYTES) {
      return NextResponse.json({ error: 'System storage capacity reached.' }, { status: 403 });
    }

    const { filename, contentType, fileSize } = await req.json();

    if (fileSize > MAX_FILE_SIZE) return NextResponse.json({ error: 'File exceeds 4MB limit.' }, { status: 400 });
    if (contentType !== 'application/pdf') return NextResponse.json({ error: 'Security Violation: Invalid file type.' }, { status: 400 });

    const sanitizedCleanName = filename.replace(/[^a-zA-Z0-9.-]/g, '_') || 'document.pdf';
    const key = `proposals/${crypto.randomUUID()}-${sanitizedCleanName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 120 });

    return NextResponse.json({ uploadUrl, url: key });
  } catch (error: unknown) {
    console.error(
      'Client Upload Token Generation Handshake Error:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ error: 'Server token generation routing aborted.' }, { status: 500 });
  }
}
