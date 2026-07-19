import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { requireRole } from '../../../../lib/routeAuth';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(req, ['admin']);
    if (auth.kind === 'denied') return auth.response;

    await connectToDatabase();
    const { studentId, isActive } = await req.json();

    // Update the student's active status
    const updatedUser = await User.findByIdAndUpdate(studentId, { isActive }, { new: true });
    
    if (!updatedUser) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    return NextResponse.json({ 
        message: `Student account ${isActive ? 'restored' : 'deactivated'} successfully` 
    }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to update student status' }, { status: 500 });
  }
}
