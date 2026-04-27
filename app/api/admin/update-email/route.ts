import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { targetUserId, newEmail } = await req.json();

    // Ensure the new email isn't already taken by someone else
    const emailExists = await User.findOne({ email: newEmail, _id: { $ne: targetUserId } });
    if (emailExists) return NextResponse.json({ error: 'This email is already in use.' }, { status: 400 });

    await User.findByIdAndUpdate(targetUserId, { email: newEmail });

    return NextResponse.json({ message: 'Email updated successfully!' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update email' }, { status: 500 });
  }
}