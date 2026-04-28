import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import Headline from '../../../../models/Headline';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectToDatabase();
    // Fetch the most recently created active headline
    const latestHeadline = await Headline.findOne({ isActive: true }).sort({ createdAt: -1 });
    return NextResponse.json({ headline: latestHeadline }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch headline' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { text } = await req.json();
    
    // Deactivate all previous headlines to keep the database clean
    await Headline.updateMany({}, { $set: { isActive: false } });
    
    // Create the new headline
    if (text && text.trim() !== '') {
      await Headline.create({ text, isActive: true });
    }
    
    return NextResponse.json({ message: 'Headline updated successfully!' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update headline' }, { status: 500 });
  }
}