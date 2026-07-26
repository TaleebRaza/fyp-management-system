import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import Headline from '../../../models/Headline';
import { requireCurrentUser } from '../../../lib/security/auth';

export const dynamic = 'force-dynamic';

// GET remains public/open so the frontend can easily read the headline on page load
export async function GET() {
  try {
    await connectToDatabase();
    // Fetch the most recently created active headline
    const latestHeadline = await Headline.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ headline: latestHeadline }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch headline' }, { status: 500 });
  }
}

// POST is now heavily fortified against unauthorized actors
export async function POST(req: NextRequest) {
  try {
    // 1. Strict Security Check: Extract the cryptographic JWT token
    const currentUser = await requireCurrentUser(req, ['admin']);
    
    // 2. Enforce Admin-Only Privileges
    if (!currentUser) {
      console.warn('Unauthorized headline broadcast attempt blocked.');
      return NextResponse.json(
        { error: 'Forbidden: Only administrators can broadcast headlines.' }, 
        { status: 403 }
      );
    }

    await connectToDatabase();
    const { text } = await req.json();
    
    // 3. Hard-delete all previous headlines to permanently reclaim database storage space
    await Headline.deleteMany({});
    
    // 4. Create the new headline
    if (text && text.trim() !== '') {
      await Headline.create({ text, isActive: true });
    }
    
    return NextResponse.json({ message: 'Headline updated successfully!' }, { status: 200 });
  } catch (error) {
    console.error('Headline API Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to update headline' }, { status: 500 });
  }
}
