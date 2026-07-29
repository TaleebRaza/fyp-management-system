import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { requireCurrentUser } from '../../../../lib/security/auth';
import mongoose from 'mongoose';
import { parseBoolean } from '../../../../lib/security/input';

export async function POST(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { id, enabled } = await req.json();
    const notificationsEnabled = parseBoolean(enabled);
    if (!mongoose.Types.ObjectId.isValid(id) || notificationsEnabled === null) {
      return NextResponse.json({ error: 'Invalid notification settings request.' }, { status: 400 });
    }
    
    const result = await User.updateOne(
      { _id: id, role: 'supervisor' },
      { $set: { notificationsEnabled } },
      { runValidators: true }
    );
    if (result.matchedCount !== 1) {
      return NextResponse.json({ error: 'Supervisor not found.' }, { status: 404 });
    }
    
    return NextResponse.json({ message: 'Notification settings updated' }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
