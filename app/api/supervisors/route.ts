import { NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';

export async function GET() {
  try {
    await connectToDatabase();
    // Returns all data (including rollNo and migrationCode) for the Admin panel
    const supervisors = await User.find({ role: 'supervisor' });
    return NextResponse.json(supervisors, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch supervisors' }, { status: 500 });
  }
}