// app/api/voice/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { s3Client, BUCKET_NAME, MAX_STORAGE_BYTES } from '../../../../lib/s3-client';
import connectToDatabase from '../../../../lib/mongodb';
import Project from '../../../../models/Project';
import SystemConfig from '../../../../models/SystemConfig';

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (token.role !== 'student' && token.role !== 'supervisor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { contentType, fileSize, projectId } = await req.json();

    if (typeof fileSize !== 'number' || !Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: 'A valid file size is required.' }, { status: 400 });
    }

    // 2. Strict 1MB size limit for voice notes
    if (fileSize > 1 * 1024 * 1024) {
      return NextResponse.json({ error: 'Voice note exceeds 1MB limit.' }, { status: 400 });
    }

    if (token.role === 'student' && !projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    await connectToDatabase();

    if (projectId) {
      const project = await Project.findById(projectId)
        .select('members supervisorId')
        .lean();
      const userId = String(token.id);
      const canUpload =
        (token.role === 'student' && project?.members?.some((member: unknown) => String(member) === userId)) ||
        (token.role === 'supervisor' && String(project?.supervisorId ?? '') === userId);

      if (!canUpload) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // 1. Storage Capacity Firewall
    const config = await SystemConfig.findOne({ configKey: 'storage' });
    if (config && config.usedBytes >= MAX_STORAGE_BYTES) {
      return NextResponse.json({ error: 'System storage capacity reached. Contact Administrator.' }, { status: 403 });
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
  } catch (error: unknown) {
    console.error('Upload URL Generation Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to generate secure upload route' }, { status: 500 });
  }
}
