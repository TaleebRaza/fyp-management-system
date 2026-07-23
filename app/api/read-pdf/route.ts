// Replace entire file with:
import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, BUCKET_NAME } from '../../../lib/s3-client';
import { requireCurrentUser } from '../../../lib/security/auth';
import { canAccessStoredObject, normalizeStorageKey } from '../../../lib/security/storage';

export async function GET(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req);
    if (!currentUser) {
      return new NextResponse('Unauthorized: You must be logged in to view secure university documents.', { status: 401 });
    }

    const key = normalizeStorageKey(req.nextUrl.searchParams.get('url'));
    if (!key) return new NextResponse('Missing or invalid document URL', { status: 400 });

    if (!await canAccessStoredObject(currentUser, key)) {
      return new NextResponse('File not found or access denied', { status: 404 });
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

  } catch (error) {
    console.error('Error fetching private blob:', error instanceof Error ? error.message : 'Unknown error');
    return new NextResponse('File not found or access denied', { status: 404 });
  }
}
