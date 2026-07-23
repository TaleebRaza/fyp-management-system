import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { requireCurrentUser } from '../../../../lib/security/auth';

export async function POST(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

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
