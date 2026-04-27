import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { sendNotificationEmail } from '../../../../lib/mailer';

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { rollNo } = await req.json();

    const user = await User.findOne({ rollNo });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!user.email) return NextResponse.json({ error: 'No email attached to this account. Contact Admin.' }, { status: 400 });

    // Check the 5-hour cooldown (5 hours = 18,000,000 milliseconds)
    if (user.lastPasswordChange) {
      const timeSinceLastChange = Date.now() - new Date(user.lastPasswordChange).getTime();
      if (timeSinceLastChange < 18000000) {
        const hoursLeft = Math.ceil((18000000 - timeSinceLastChange) / 3600000);
        return NextResponse.json({ error: `Password was changed recently. Please try again in ${hoursLeft} hours.` }, { status: 429 });
      }
    }

    // Generate a 6-digit OTP and set expiry to 15 minutes
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 15 * 60000); 

    await User.findByIdAndUpdate(user._id, { resetCode: code, resetCodeExpiry: expiry });

    const htmlContent = `
      <div style="font-family: sans-serif; padding: 20px; text-align: center;">
        <h2>Password Reset Request</h2>
        <p>Your one-time password reset code is:</p>
        <h1 style="letter-spacing: 4px; color: #10b981;">${code}</h1>
        <p>This code will expire in 15 minutes. If you did not request this, please ignore this email.</p>
      </div>
    `;
    
    await sendNotificationEmail(user.email, 'Your Password Reset Code', htmlContent);

    return NextResponse.json({ message: 'Code sent to your registered email!' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}