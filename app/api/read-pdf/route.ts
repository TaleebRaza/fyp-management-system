// Replace entire file with:
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, BUCKET_NAME } from '../../../lib/s3-client';

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    
    if (!token) {
      console.warn('Unauthorized PDF access attempt blocked.');
      return new NextResponse('Unauthorized: You must be logged in to view secure university documents.', { status: 401 });
    }

    const key = req.nextUrl.searchParams.get('url');
    if (!key) return new NextResponse('Missing Document URL', { status: 400 });

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

  } catch (error: any) {
    console.error('Error fetching private blob:', error.message);
    return new NextResponse('File not found or access denied', { status: 404 });
  }
}