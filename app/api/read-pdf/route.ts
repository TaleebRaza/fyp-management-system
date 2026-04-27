import { get } from '@vercel/blob';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    // Extract the private blob URL from the query parameter
    const url = req.nextUrl.searchParams.get('url');
    if (!url) return new Response('Missing Document URL', { status: 400 });

    // Securely fetch the private stream using the Vercel SDK
    const { stream, blob } = await get(url, {
      access: 'private',
    });

    // Stream the PDF directly to the browser viewer
    return new Response(stream, {
      headers: {
        'Content-Type': blob.contentType || 'application/pdf',
        'Content-Disposition': `inline; filename="${blob.pathname.split('/').pop()}"`,
      },
    });
  } catch (error) {
    console.error('Error fetching private blob:', error);
    return new Response('File not found or access denied', { status: 404 });
  }
}