// app/api/register/send-otp/route.ts
import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { buildRollNoRegex, normalizeRollNo } from '../../../../lib/rollNo';
import {
  UNIVERSITY_EMAIL_PATTERN,
  doesRollNoMatchUniversityEmail,
  getExpectedUniversityEmailExample,
  normalizeUniversityEmail,
} from '../../../../lib/studentIdentity';
import Otp from '../../../../models/Otp';
import RateLimit from '../../../../models/RateLimit';
import { sendNotificationEmail } from '../../../../lib/mailer';

const OTP_COOLDOWN_MS = 180 * 1000;
const OTP_EXPIRY_MINUTES = 15;
const OTP_REQUEST_LIMIT = 5;

type OtpTemplate = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOtpTemplates(code: string): OtpTemplate[] {
  const safeCode = escapeHtml(code);

  return [
    {
      subject: 'FYP Portal verification code',
      text: `Your FYP Portal verification code is: ${code}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not request this code, you can ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6; font-size: 14px;">
          <p>Your FYP Portal verification code is:</p>
          <p style="font-size: 24px; font-weight: 700; letter-spacing: 3px; margin: 12px 0;">${safeCode}</p>
          <p>This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
          <p>If you did not request this code, you can ignore this email.</p>
        </div>
      `,
    },
    {
      subject: 'Your FYP Portal code',
      text: `Use this code to verify your FYP Portal registration: ${code}\n\nThe code will expire in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf this was not you, no action is needed.`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6; font-size: 14px;">
          <p>Use this code to verify your FYP Portal registration:</p>
          <p style="font-size: 24px; font-weight: 700; letter-spacing: 3px; margin: 12px 0;">${safeCode}</p>
          <p>The code will expire in ${OTP_EXPIRY_MINUTES} minutes.</p>
          <p>If this was not you, no action is needed.</p>
        </div>
      `,
    },
    {
      subject: 'FYP Portal account verification',
      text: `FYP Portal account verification\n\nCode: ${code}\n\nThis code is valid for ${OTP_EXPIRY_MINUTES} minutes.\n\nYou can ignore this email if you did not request registration.`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6; font-size: 14px;">
          <p>FYP Portal account verification</p>
          <p>Code:</p>
          <p style="font-size: 24px; font-weight: 700; letter-spacing: 3px; margin: 12px 0;">${safeCode}</p>
          <p>This code is valid for ${OTP_EXPIRY_MINUTES} minutes.</p>
          <p>You can ignore this email if you did not request registration.</p>
        </div>
      `,
    },
    {
      subject: 'Verification code for FYP Portal',
      text: `Your verification code for FYP Portal is ${code}.\n\nIt expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not request this, please ignore the message.`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6; font-size: 14px;">
          <p>Your verification code for FYP Portal is:</p>
          <p style="font-size: 24px; font-weight: 700; letter-spacing: 3px; margin: 12px 0;">${safeCode}</p>
          <p>It expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
          <p>If you did not request this, please ignore the message.</p>
        </div>
      `,
    },
  ];
}

function pickOtpTemplate(code: string) {
  const templates = buildOtpTemplates(code);
  return templates[randomInt(0, templates.length)];
}

export async function POST(req: Request) {
  try {
    const { email, rollNo } = await req.json();
    const normalizedEmail = normalizeUniversityEmail(email);
    const normalizedRollNo = normalizeRollNo(rollNo);

    if (!normalizedEmail) {
      return NextResponse.json({ error: 'No email found. Please provide a valid university email address.' }, { status: 400 });
    }

    if (!normalizedRollNo) {
      return NextResponse.json({ error: 'Roll Number is required.' }, { status: 400 });
    }

    if (!UNIVERSITY_EMAIL_PATTERN.test(normalizedEmail)) {
      return NextResponse.json({
        error: 'Invalid email structure. Please use your officially formatted university email prefix (e.g., f23-0201@student.uoh.edu.pk)',
      }, { status: 400 });
    }

    if (!doesRollNoMatchUniversityEmail(normalizedRollNo, normalizedEmail)) {
      return NextResponse.json(
        {
          error: `Your roll number and university email do not match. For ${normalizedRollNo}, use an email like ${getExpectedUniversityEmailExample(normalizedRollNo)}.`,
        },
        { status: 400 }
      );
    }

    await connectToDatabase();

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

    const existingOtp = await Otp.findOne({ email: normalizedEmail });
    if (existingOtp) {
      const timeSinceLastOtp = Date.now() - new Date(existingOtp.createdAt).getTime();
      if (timeSinceLastOtp < OTP_COOLDOWN_MS) {
        const secondsLeft = Math.ceil((OTP_COOLDOWN_MS - timeSinceLastOtp) / 1000);
        return NextResponse.json({
          error: `Please wait ${secondsLeft} seconds before requesting a new code.`,
        }, { status: 429 });
      }
    }

    const rateLimit = await RateLimit.findOneAndUpdate(
      { identifier: normalizedEmail },
      { $inc: { count: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (rateLimit.count > OTP_REQUEST_LIMIT) {
      return NextResponse.json({
        error: 'Security limits reached. You have requested too many codes. Please try again in an hour.',
      }, { status: 429 });
    }

    const code = randomInt(100000, 1000000).toString();

    await Otp.findOneAndUpdate(
      { email: normalizedEmail },
      { code, createdAt: new Date() },
      { upsert: true, new: true }
    );

    const template = pickOtpTemplate(code);
    const emailSent = await sendNotificationEmail(normalizedEmail, template.subject, template.html, template.text, {
      fromName: 'FYP Portal',
    });

    if (!emailSent) {
      await Otp.findOneAndDelete({ email: normalizedEmail });
      await RateLimit.updateOne({ identifier: normalizedEmail }, { $inc: { count: -1 } });

      return NextResponse.json({
        error: 'No email found or mailer service failed to deliver. Please verify your address or try again later.',
      }, { status: 404 });
    }

    return NextResponse.json({ message: 'Verification code sent to your university email!' }, { status: 200 });
  } catch (error: any) {
    console.error('Send OTP Error:', error.message);
    return NextResponse.json({ error: 'Failed to process verification request. Please try again.' }, { status: 500 });
  }
}