import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';

export async function GET() {
  try {
    await connectToDatabase();

    // Fetch strictly necessary fields for Supervisors
    const supervisors = await User.find({ role: 'supervisor' })
                                  .select('_id name')
                                  .lean();

    // Fetch strictly necessary fields for Students
    const students = await User.find({ role: 'student' })
                               .select('_id name supervisorId isActive')
                               .lean();

    return NextResponse.json({ supervisors, students }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch graph data' }, { status: 500 });
  }
}