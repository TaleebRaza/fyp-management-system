// app/api/voice/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { s3Client, BUCKET_NAME, MAX_STORAGE_BYTES } from '../../../../lib/s3-client';
import connectToDatabase from '../../../../lib/mongodb';
import SystemConfig from '../../../../models/SystemConfig';
import { hasProjectAccess, requireCurrentUser } from '../../../../lib/security/auth';

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();
    
    // 1. Storage Capacity Firewall
    const config = await SystemConfig.findOne({ configKey: 'storage' });
    if (config && config.usedBytes >= MAX_STORAGE_BYTES) {
      return NextResponse.json({ error: 'System storage capacity reached. Contact Administrator.' }, { status: 403 });
    }

    const { contentType, fileSize, projectId } = await req.json();

    if (contentType !== 'audio/webm') {
      return NextResponse.json({ error: 'Voice notes must use the audio/webm format.' }, { status: 400 });
    }

    // 2. Strict 1MB size limit for voice notes
    if (fileSize > 1 * 1024 * 1024) {
      return NextResponse.json({ error: 'Voice note exceeds 1MB limit.' }, { status: 400 });
    }

    const isVoiceNote = Boolean(projectId);
    if (isVoiceNote && !await hasProjectAccess(currentUser, String(projectId))) {
      return NextResponse.json({ error: 'Project not found or access denied.' }, { status: 403 });
    }

    if (!isVoiceNote && currentUser.role !== 'supervisor') {
      return NextResponse.json({ error: 'Project ID required for voice notes.' }, { status: 400 });
    }

    // A voice-note key is bound to both its sender and its project. The no-project
    // branch is only for the existing supervisor broadcast uploader.
    const key = isVoiceNote
      ? `voicenotes/${currentUser.id}/${projectId}/${crypto.randomUUID()}.webm`
      : `broadcasts/${currentUser.id}/${crypto.randomUUID()}.webm`;

    // 4. Create Presigned URL strictly for this specific key
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType || 'audio/webm',
    });

    // Generate a URL that self-destructs in 60 seconds
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

    return NextResponse.json({ uploadUrl, key });
  } catch (error) {
    console.error(
      'Upload URL Generation Error:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ error: 'Failed to generate secure upload route' }, { status: 500 });
  }
}
