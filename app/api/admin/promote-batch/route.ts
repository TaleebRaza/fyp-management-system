import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { normalizeText } from '../../../../lib/security/input';

export async function POST(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { targetBatch } = await req.json();
    const normalizedBatch = normalizeText(targetBatch, 20);

    if (!/^(Spring|Fall) \d{4}$/.test(normalizedBatch)) {
      return NextResponse.json({ error: 'A valid batch is required.' }, { status: 400 });
    }

    const result = await User.updateMany(
      { role: 'student', batch: normalizedBatch },
      { $set: { semester: '8th Semester' } },
      { runValidators: true }
    );

    return NextResponse.json({ 
      message: `Successfully promoted ${result.modifiedCount} students in ${normalizedBatch} to 8th Semester!`
    }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to promote batch' }, { status: 500 });
  }
}
