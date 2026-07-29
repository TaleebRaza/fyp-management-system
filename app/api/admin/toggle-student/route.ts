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
    const { studentId, isActive } = await req.json();
    const nextIsActive = parseBoolean(isActive);
    if (!mongoose.Types.ObjectId.isValid(studentId) || nextIsActive === null) {
      return NextResponse.json({ error: 'Invalid student status request.' }, { status: 400 });
    }

    const updatedUser = await User.updateOne(
      { _id: studentId, role: 'student' },
      { $set: { isActive: nextIsActive } },
      { runValidators: true }
    );
    if (updatedUser.matchedCount !== 1) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    return NextResponse.json({
        message: `Student account ${nextIsActive ? 'restored' : 'deactivated'} successfully`
    }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to update student status' }, { status: 500 });
  }
}
