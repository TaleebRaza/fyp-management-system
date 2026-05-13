// app/api/register/send-otp/route.ts
import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Otp from '../../../../models/Otp';
import { sendNotificationEmail } from '../../../../lib/mailer';

export async function POST(req: Request) {
  try {
    const { email, rollNo } = await req.json();

    // Explicit Pre-Flight Check: Halt immediately if email is absent to save execution efficiency
    if (!email) {
      return NextResponse.json({ error: 'No email found. Please provide a valid university email address.' }, { status: 400 });
    }

    if (!rollNo) {
      return NextResponse.json({ error: 'Roll Number is required.' }, { status: 400 });
    }

    // Upgraded Regex Firewall: Enforces structured sequential mapping typical of student IDs
    // Accepts Formats: 'f23-0201', 'sp24-001', 'fa20-bcs-001', or staff formats containing valid separators.
    // Blocks unstructured continuous random strings like '123450agdfugeb'.
    const universityEmailPattern = /^([a-zA-Z]{1,3}\d{2}[-.]\d{3,5}|[a-zA-Z]{2}\d{2}[-.][a-zA-Z]{3}[-.]\d{3}|[a-zA-Z0-9]+[-.][a-zA-Z0-9]+)@(student\.)?uoh\.edu\.pk$/i;

    if (!universityEmailPattern.test(email.trim())) {
      return NextResponse.json({ 
        error: 'Invalid email structure. Please use your officially formatted university email prefix (e.g., f23-0201@student.uoh.edu.pk or fa20-bcs-001@student.uoh.edu.pk)' 
      }, { status: 400 });
    }

    await connectToDatabase();

    // 1. Prevent dispatching verification codes for existing accounts
    const existingUser = await User.findOne({ $or: [{ email }, { rollNo }] });
    if (existingUser) {
      return NextResponse.json({ error: 'This Roll Number or Email is already registered!' }, { status: 400 });
    }

    // 2. Generate a secure 6-digit OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Atomically upsert the OTP document to overwrite previous unused codes requested by this email
    await Otp.findOneAndUpdate(
      { email },
      { code, createdAt: new Date() },
      { upsert: true, new: true }
    );

    // 4. Construct and dispatch email notification
    const htmlContent = `
      <div style="font-family: sans-serif; padding: 20px; text-align: center; background-color: #f8fafc; border-radius: 12px;">
        <h2 style="color: #0f172a;">University Account Verification</h2>
        <p style="color: #475569;">Your one-time registration verification code is:</p>
        <h1 style="letter-spacing: 6px; color: #3b82f6; font-size: 36px; background-color: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; display: inline-block;">${code}</h1>
        <p style="color: #64748b; font-size: 12px; margin-top: 20px;">This code is valid for exactly 15 minutes. If you did not request this account registration, please ignore this email.</p>
      </div>
    `;

    const emailSent = await sendNotificationEmail(email, 'Your FYP Portal Registration Code', htmlContent);
    if (!emailSent) {
      // Clean up the pending OTP record immediately to ensure database integrity
      await Otp.findOneAndDelete({ email });
      return NextResponse.json({ error: 'No email found or mailer service failed to deliver. Please verify your address.' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Verification code sent to your university email!' }, { status: 200 });
  } catch (error: any) {
    console.error('Send OTP Error:', error.message);
    return NextResponse.json({ error: 'Failed to process verification request. Please try again.' }, { status: 500 });
  }
}