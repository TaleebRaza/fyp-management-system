// Replace entire file with:
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, BUCKET_NAME } from '../../../lib/s3-client';
import connectToDatabase from '../../../lib/mongodb';
import Project from '../../../models/Project';
import User from '../../../models/User';
import VoiceNote from '../../../models/VoiceNote';

type ProjectAccessRecord = {
  members?: unknown[];
  supervisorId?: unknown;
};

function canAccessProject(
  project: ProjectAccessRecord | null,
  userId: string,
  role: unknown
) {
  if (!project) return false;

  return (
    role === 'admin' ||
    String(project.supervisorId ?? '') === userId ||
    project.members?.some((member) => String(member) === userId) === true
  );
}

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token || !token.id) {
      console.warn('Unauthorized PDF access attempt blocked.');
      return new NextResponse('Unauthorized: You must be logged in to view secure university documents.', { status: 401 });
    }

    const requestedKey = req.nextUrl.searchParams.get('url');
    if (!requestedKey) return new NextResponse('Missing Document URL', { status: 400 });

    let key = requestedKey.trim();
    try {
      key = new URL(key).pathname.replace(/^\/+/, '');
    } catch {
      key = key.replace(/^\/+/, '');
    }

    if (!key) return new NextResponse('Missing Document URL', { status: 400 });

    const userId = String(token.id);
    const keyPattern = new RegExp(
      `(?:^|/)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
    );

    await connectToDatabase();

    const project = await Project.findOne({ pdfUrl: keyPattern })
      .select('members supervisorId')
      .lean();

    let isAllowed = canAccessProject(project, userId, token.role);

    if (!isAllowed) {
      const voiceNote = await VoiceNote.findOne({ blobUrl: keyPattern })
        .select('projectId')
        .lean();

      if (voiceNote?.projectId) {
        const voiceProject = await Project.findById(voiceNote.projectId)
          .select('members supervisorId')
          .lean();
        isAllowed = canAccessProject(voiceProject, userId, token.role);
      }
    }

    if (!isAllowed) {
      const legacyPdfOwner = await User.findOne({ role: 'student', pdfUrl: keyPattern })
        .select('_id projectId supervisorId')
        .lean();

      if (legacyPdfOwner) {
        isAllowed =
          token.role === 'admin' ||
          String(legacyPdfOwner._id) === userId ||
          String(legacyPdfOwner.supervisorId ?? '') === userId;

        if (!isAllowed && legacyPdfOwner.projectId) {
          const legacyProject = await Project.findById(legacyPdfOwner.projectId)
            .select('members supervisorId')
            .lean();
          isAllowed = canAccessProject(legacyProject, userId, token.role);
        }
      }
    }

    if (!isAllowed) {
      const broadcastOwner = await User.findOne({
        role: 'supervisor',
        broadcastType: 'audio',
        broadcastContent: keyPattern,
      })
        .select('_id')
        .lean();

      if (broadcastOwner) {
        isAllowed = token.role === 'admin' || String(broadcastOwner._id) === userId;

        if (!isAllowed && token.role === 'student') {
          const isAssignedStudent = await User.exists({
            _id: userId,
            role: 'student',
            supervisorId: broadcastOwner._id,
          });
          isAllowed = Boolean(isAssignedStudent);
        }
      }
    }

    if (!isAllowed) {
      return new NextResponse('File not found or access denied', { status: 403 });
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: `inline; filename="${key.split('/').pop()}"`,
      // Removed ResponseContentType override so Cloudflare serves the native file type (audio/webm OR application/pdf)
    });

    // Redirect the browser directly to the secure R2 stream (valid for 5 minutes)
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    
    // Strict Anti-Caching Headers to prevent the UI from displaying old PDFs
    return NextResponse.redirect(signedUrl, {
      status: 307,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching private blob:', message);
    return new NextResponse('File not found or access denied', { status: 404 });
  }
}
