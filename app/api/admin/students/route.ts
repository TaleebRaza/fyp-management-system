import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectToDatabase();
    
    // Fetch all users with the role of student
    const students = await User.find({ role: 'student' })
                               .sort({ createdAt: -1 })
                               .lean();
                               
    return NextResponse.json({ students }, { status: 200 });
  } catch (error) {
    console.error('Admin Students Fetch Error:', error);
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
  }
}