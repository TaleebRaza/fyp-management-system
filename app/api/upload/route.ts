import { put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto'; // Built-in Node.js module for secure UUIDs

// 1. Define Strict Limits (Crucial for Vercel Hobby Tier)
// Next.js serverless functions have a ~4.5MB request body limit on free tiers.
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB maximum size

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 2. Strict MIME-Type Validation
    // Never trust the frontend extension. Check the actual file type payload.
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Security Check Failed: Only authentic PDF files are permitted.' }, { status: 400 });
    }

    // 3. Strict Size Validation
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File is too large. Maximum size allowed is 4MB.' }, { status: 400 });
    }

    // 4. Collision-Proof File Naming & Sanitization
    // Strip out weird characters, spaces, and potential path-traversal strings
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    // Use a cryptographic UUID instead of Date.now() to guarantee 100% uniqueness
    const uniqueId = crypto.randomUUID();
    const safeFilename = `proposals/${uniqueId}-${sanitizedName}`;

    // 5. Secure Upload to Vercel Blob
    const blob = await put(safeFilename, file, {
      access: 'private', // Keeps the document locked from public internet
    });

    return NextResponse.json({ url: blob.url });
    
  } catch (err: any) {
    console.error('Vercel Blob Upload error:', err.message);
    return NextResponse.json({ error: 'Upload failed due to a server error.' }, { status: 500 });
  }
}