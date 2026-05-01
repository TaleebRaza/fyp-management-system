import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import Headline from '../../../models/Headline';
import { getToken } from 'next-auth/jwt'; // NEW: Secure token verification

export const dynamic = 'force-dynamic';

// GET remains public/open so the frontend can easily read the headline on page load
export async function GET() {
  try {
    await connectToDatabase();
    // Fetch the most recently created active headline
    const latestHeadline = await Headline.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ headline: latestHeadline }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch headline' }, { status: 500 });
  }
}

// POST is now heavily fortified against unauthorized actors
export async function POST(req: NextRequest) {
  try {
    // 1. Strict Security Check: Extract the cryptographic JWT token
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    
    // 2. Enforce Admin-Only Privileges
    if (!token || token.role !== 'admin') {
      console.warn(`Unauthorized headline broadcast attempt by User ID: ${token?.id || 'Unknown IP'}`);
      return NextResponse.json(
        { error: 'Forbidden: Only administrators can broadcast headlines.' }, 
        { status: 403 }
      );
    }

    await connectToDatabase();
    const { text } = await req.json();
    
    // 3. Deactivate all previous headlines to keep the database clean
    await Headline.updateMany({}, { $set: { isActive: false } });
    
    // 4. Create the new headline
    if (text && text.trim() !== '') {
      await Headline.create({ text, isActive: true });
    }
    
    return NextResponse.json({ message: 'Headline updated successfully!' }, { status: 200 });
  } catch (error: any) {
    console.error('Headline API Error:', error.message);
    return NextResponse.json({ error: 'Failed to update headline' }, { status: 500 });
  }
}