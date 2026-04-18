import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { id, enabled } = await req.json();
    
    // Update the supervisor's notificationsEnabled field
    await User.findByIdAndUpdate(id, { notificationsEnabled: enabled });
    
    return NextResponse.json({ message: 'Notification settings updated' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}