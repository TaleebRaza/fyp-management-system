import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { targetBatch } = await req.json();

    if (!targetBatch) return NextResponse.json({ error: 'Batch is required' }, { status: 400 });

    const result = await User.updateMany(
      { role: 'student', batch: targetBatch },
      { $set: { semester: '8th Semester' } }
    );

    return NextResponse.json({ 
      message: `Successfully promoted ${result.modifiedCount} students in ${targetBatch} to 8th Semester!` 
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to promote batch' }, { status: 500 });
  }
}