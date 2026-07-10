// app/api/register/send-otp/route.ts
import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { buildRollNoRegex, normalizeRollNo } from '../../../../lib/rollNo';
import Otp from '../../../../models/Otp';
import RateLimit from '../../../../models/RateLimit'; // NEW: Imported the RateLimit model
import { sendNotificationEmail } from '../../../../lib/mailer';

export async function POST(req: Request) {
  try {
    const { email, rollNo } = await req.json();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedRollNo = normalizeRollNo(rollNo);

    // Explicit Pre-Flight Check: Halt immediately if email is absent
    if (!normalizedEmail) {
      return NextResponse.json({ error: 'No email found. Please provide a valid university email address.' }, { status: 400 });
    }

    if (!normalizedRollNo) {
      return NextResponse.json({ error: 'Roll Number is required.' }, { status: 400 });
    }

    // Upgraded Regex Firewall
    const universityEmailPattern = /^([a-zA-Z]{1,3}\d{2}[-.]\d{3,5}|[a-zA-Z]{2}\d{2}[-.][a-zA-Z]{3}[-.]\d{3}|[a-zA-Z0-9]+[-.][a-zA-Z0-9]+)@(student\.)?uoh\.edu\.pk$/i;

    if (!universityEmailPattern.test(normalizedEmail)) {
      return NextResponse.json({ 
        error: 'Invalid email structure. Please use your officially formatted university email prefix (e.g., f23-0201@student.uoh.edu.pk)' 
      }, { status: 400 });
    }

    await connectToDatabase();

    // 1. Prevent dispatching verification codes for existing accounts
    const existingUser = await User.findOne({
      $or: [
        { email: normalizedEmail },
        { rollNo: normalizedRollNo },
        { rollNo: buildRollNoRegex(normalizedRollNo) },
      ],
    });

    if (existingUser) {
      return NextResponse.json({ error: 'This Roll Number or Email is already registered!' }, { status: 400 });
    }

    // 2. Strict 60-Second Cooldown Check (Using existing OTP ledger)
    const existingOtp = await Otp.findOne({ email: normalizedEmail });
    if (existingOtp) {
      const timeSinceLastOtp = Date.now() - new Date(existingOtp.createdAt).getTime();
      if (timeSinceLastOtp < 60000) { // 60,000 ms = 60 seconds 
        const secondsLeft = Math.ceil((180000 - timeSinceLastOtp) / 1000);
        return NextResponse.json({ 
          error: `Please wait ${secondsLeft} seconds before requesting a new code.` 
        }, { status: 429 });
      }
    }

    // 3. 1-Hour Quota Check (Max 5 requests per hour)
    const rateLimit = await RateLimit.findOneAndUpdate(
      { identifier: normalizedEmail },
      { $inc: { count: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (rateLimit.count > 5) {
      return NextResponse.json({ 
        error: 'Security limits reached. You have requested too many codes. Please try again in an hour.' 
      }, { status: 429 });
    }

    // 4. Generate a secure 6-digit OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 5. Atomically upsert the OTP document
    await Otp.findOneAndUpdate(
      { email: normalizedEmail },
      { code, createdAt: new Date() },
      { upsert: true, new: true }
    );

    // 6. Construct and dispatch email notification
    const htmlContent = `
      <div style="font-family: sans-serif; padding: 20px; text-align: center; background-color: #f8fafc; border-radius: 12px;">
        <h2 style="color: #0f172a;">University Account Verification</h2>
        <p style="color: #475569;">Your one-time registration verification code is:</p>
        <h1 style="letter-spacing: 6px; color: #3b82f6; font-size: 36px; background-color: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; display: inline-block;">${code}</h1>
        <p style="color: #64748b; font-size: 12px; margin-top: 20px;">This code is valid for exactly 15 minutes. If you did not request this account registration, please ignore this email.</p>
      </div>
    `;

    const emailSent = await sendNotificationEmail(normalizedEmail, 'Your FYP Portal Registration Code', htmlContent);
    
    if (!emailSent) {
      // EMERGENCY CLEANUP: If the mailer fails, we wipe the pending OTP and refund the user's rate limit quota
      await Otp.findOneAndDelete({ email: normalizedEmail });
      await RateLimit.updateOne({ identifier: normalizedEmail }, { $inc: { count: -1 } });
      
      return NextResponse.json({ 
        error: 'No email found or mailer service failed to deliver. Please verify your address or try again later.' 
      }, { status: 404 });
    }

    return NextResponse.json({ message: 'Verification code sent to your university email!' }, { status: 200 });
  } catch (error: any) {
    console.error('Send OTP Error:', error.message);
    return NextResponse.json({ error: 'Failed to process verification request. Please try again.' }, { status: 500 });
  }
}