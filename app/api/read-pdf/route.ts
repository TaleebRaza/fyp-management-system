import { get } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt'; // NEW: Cryptographic token verification

export async function GET(req: NextRequest) {
  try {
    // 1. Strict Security Firewall: Verify the user is authenticated
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    
    if (!token) {
      console.warn('Unauthorized PDF access attempt blocked.');
      return new NextResponse('Unauthorized: You must be logged in to view secure university documents.', { status: 401 });
    }

    // 2. Extract the private blob URL from the query parameter
    const url = req.nextUrl.searchParams.get('url');
    if (!url) return new NextResponse('Missing Document URL', { status: 400 });

    // 3. Securely fetch the private stream using the Vercel SDK
    const result = await get(url, {
      access: 'private',
    });

    if (!result) {
      return new NextResponse('File not found or access denied', { status: 404 });
    }

    const { stream, blob } = result as any;

    // 4. Stream the PDF directly to the authenticated browser
    return new NextResponse(stream as any, {
      headers: {
        'Content-Type': blob?.contentType || 'application/pdf',
        // 'inline' tells the browser to display it rather than forcing a download
        'Content-Disposition': `inline; filename="${(blob?.pathname || url).split('/').pop()}"`,
      },
    });
  } catch (error: any) {
    console.error('Error fetching private blob:', error.message);
    return new NextResponse('File not found or access denied', { status: 404 });
  }
}