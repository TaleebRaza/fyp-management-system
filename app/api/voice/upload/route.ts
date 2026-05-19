import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import crypto from 'crypto';

const MAX_AUDIO_SIZE = 1 * 1024 * 1024; // 1MB Strict Limit for 60s highly-compressed WebM

export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
        if (!token || !token.id) {
          throw new Error('Unauthorized: Authentication token missing.');
        }

        // Strict validation: Only accept WebM audio blobs from our frontend MediaRecorder
        if (!pathname.endsWith('.webm') && !pathname.endsWith('.mp4')) {
          throw new Error('Security Violation: Only standard compressed audio payloads are accepted.');
        }

        const cryptographicUUID = crypto.randomUUID();
        const absolutePathname = `voicenotes/${cryptographicUUID}-${Date.now()}.webm`;

        return {
          allowedContentTypes: ['audio/webm', 'audio/mp4', 'video/webm'], 
          maximumSizeInBytes: MAX_AUDIO_SIZE,
          tokenPayload: JSON.stringify({ userId: token.id }),
          pathname: absolutePathname,
          access: 'private', // Keeps voice notes entirely locked from the public internet
        };
      }
    });

    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Server token generation routing aborted.' },
      { status: 400 }
    );
  }
}