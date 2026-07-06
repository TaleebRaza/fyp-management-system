// app/api/voice/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { s3Client, BUCKET_NAME, MAX_STORAGE_BYTES } from '../../../../lib/s3-client';
import connectToDatabase from '../../../../lib/mongodb';
import SystemConfig from '../../../../models/SystemConfig';

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || !token.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();
    
    // 1. Storage Capacity Firewall
    const config = await SystemConfig.findOne({ configKey: 'storage' });
    if (config && config.usedBytes >= MAX_STORAGE_BYTES) {
      return NextResponse.json({ error: 'System storage capacity reached. Contact Administrator.' }, { status: 403 });
    }

    const { contentType, fileSize } = await req.json();

    // 2. Strict 1MB size limit for voice notes
    if (fileSize > 1 * 1024 * 1024) {
      return NextResponse.json({ error: 'Voice note exceeds 1MB limit.' }, { status: 400 });
    }

    // 3. Generate secure S3 Key
    const key = `voicenotes/${crypto.randomUUID()}-${Date.now()}.webm`;

    // 4. Create Presigned URL strictly for this specific key
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType || 'audio/webm',
    });

    // Generate a URL that self-destructs in 60 seconds
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

    return NextResponse.json({ uploadUrl, key });
  } catch (error: any) {
    console.error('Upload URL Generation Error:', error.message);
    return NextResponse.json({ error: 'Failed to generate secure upload route' }, { status: 500 });
  }
}