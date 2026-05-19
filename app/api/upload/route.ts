import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import crypto from 'crypto';

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB strict ceiling

export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // --- OPTIMIZATION: Secure Token Generation Handshake ---
        const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
        if (!token || !token.id) {
          throw new Error('Unauthorized: Authentication token missing or invalid.');
        }

        // We will expand this array in Milestone 2 to accept audio/webm
        if (!pathname.endsWith('.pdf')) {
          throw new Error('Security Violation: Invalid file type.');
        }

        const sanitizedCleanName = pathname.split('/').pop()?.replace(/[^a-zA-Z0-9.-]/g, '_') || 'document.pdf';
        const cryptographicUUID = crypto.randomUUID();
        const absolutePathname = `proposals/${cryptographicUUID}-${sanitizedCleanName}`;

        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: MAX_FILE_SIZE,
          tokenPayload: JSON.stringify({ userId: token.id }),
          pathname: absolutePathname,
          access: 'private', 
        };
      }
    });

    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    console.error('Client Upload Token Generation Handshake Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Server token generation routing aborted.' },
      { status: error.message?.includes('Unauthorized') ? 401 : 400 }
    );
  }
}