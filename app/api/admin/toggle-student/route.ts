import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';

export async function POST(req: Request) {
  try {
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
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update student status' }, { status: 500 });
  }
}