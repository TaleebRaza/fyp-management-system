import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { requireRole } from '../../../../lib/routeAuth';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(req, ['admin']);
    if (auth.kind === 'denied') return auth.response;

    await connectToDatabase();
    const { id, enabled } = await req.json();
    
    // Update the supervisor's notificationsEnabled field
    await User.findByIdAndUpdate(id, { notificationsEnabled: enabled });
    
    return NextResponse.json({ message: 'Notification settings updated' }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
