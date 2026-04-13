import { NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { id } = await req.json();

    // 1. Delete the supervisor
    await User.findByIdAndDelete(id);

    // 2. Safely unassign any students that belonged to this supervisor
    await User.updateMany(
      { supervisorId: id }, 
      { $set: { supervisorId: null, status: 'Unassigned', remarks: 'Your supervisor was removed from the system. Please select a new one.' } }
    );

    return NextResponse.json({ message: 'Supervisor deleted successfully' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete supervisor' }, { status: 500 });
  }
}