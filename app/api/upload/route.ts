import { put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // FIX: Using 'private' access to securely lock the document
    const blob = await put(`proposals/${Date.now()}-${file.name}`, file, {
      access: 'private',
    });

    return NextResponse.json({ url: blob.url });
    
  } catch (err) {
    console.error('Vercel Blob Upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}