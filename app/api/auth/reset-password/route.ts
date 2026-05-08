import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import bcrypt from 'bcryptjs'; // NEW: Import secure hashing library

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { rollNo, code, newPassword } = await req.json();

    const user = await User.findOne({ rollNo });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Verify Code and Expiration
    if (user.resetCode !== code) return NextResponse.json({ error: 'Invalid reset code' }, { status: 400 });
    if (new Date() > new Date(user.resetCodeExpiry)) return NextResponse.json({ error: 'Code has expired' }, { status: 400 });

    // NEW: Hash the new password before updating the database
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password securely, clear the code, and set the 5-hour cooldown timer
    await User.findByIdAndUpdate(user._id, {
      password: hashedPassword, // SECURE: Save the hashed password
      resetCode: null,
      resetCodeExpiry: null,
      lastPasswordChange: new Date()
    });

    return NextResponse.json({ message: 'Password successfully updated! You can now log in.' }, { status: 200 });
  } catch (error: any) {
    console.error('Password reset error:', error.message);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}