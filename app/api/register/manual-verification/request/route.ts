import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import connectToDatabase from '../../../../../lib/mongodb';
import User from '../../../../../models/User';
import PendingVerification from '../../../../../models/PendingVerification';
import Project from '../../../../../models/Project';
import { APP_SETTINGS, PROGRAM_MAP } from '../../../../../config/appSettings';
import { buildRollNoRegex, normalizeRollNo } from '../../../../../lib/rollNo';
import { getSupervisorMaxSlots } from '../../../../../lib/supervisorSlots';
import {
  UNIVERSITY_EMAIL_PATTERN,
  buildManualVerificationPhrase,
  doesRollNoMatchUniversityEmail,
  getExpectedUniversityEmailExample,
  normalizeUniversityEmail,
} from '../../../../../lib/studentIdentity';

async function getFilledSlots(supervisorId: string) {
  if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'STUDENT') {
    return User.countDocuments({ role: 'student', supervisorId });
  }

  return Project.countDocuments({ supervisorId });
}

export async function POST(req: Request) {
  try {
    const { name, email, rollNo, password, supervisorId, program, batch } = await req.json();

    const safeName = String(name || '').trim();
    const normalizedEmail = normalizeUniversityEmail(email);
    const normalizedRollNo = normalizeRollNo(rollNo);
    const safePassword = String(password || '');
    const safeProgram = String(program || 'BSCS').trim().toUpperCase();
    const safeBatch = String(batch || '').trim();
    const safeSupervisorId = String(supervisorId || '').trim();

    if (!safeName || !normalizedEmail || !normalizedRollNo || !safePassword || !safeProgram || !safeBatch) {
      return NextResponse.json(
        { error: 'Missing required registration details.' },
        { status: 400 }
      );
    }

    if (safePassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    if (!UNIVERSITY_EMAIL_PATTERN.test(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Use your official university email address.' },
        { status: 400 }
      );
    }

    if (!doesRollNoMatchUniversityEmail(normalizedRollNo, normalizedEmail)) {
      return NextResponse.json(
        {
          error: `Your roll number and university email do not match. For ${normalizedRollNo}, use an email like ${getExpectedUniversityEmailExample(normalizedRollNo)}.`,
        },
        { status: 400 }
      );
    }

    if (!Object.prototype.hasOwnProperty.call(PROGRAM_MAP, safeProgram)) {
      return NextResponse.json({ error: 'Invalid program selected.' }, { status: 400 });
    }

    if (safeSupervisorId && !mongoose.Types.ObjectId.isValid(safeSupervisorId)) {
      return NextResponse.json({ error: 'Invalid supervisor selected.' }, { status: 400 });
    }

    await connectToDatabase();

    const existingUser = await User.findOne({
      $or: [
        { email: normalizedEmail },
        { rollNo: normalizedRollNo },
        { rollNo: buildRollNoRegex(normalizedRollNo) },
      ],
    }).select('_id');

    if (existingUser) {
      return NextResponse.json(
        { error: 'This Roll Number or Email is already registered.' },
        { status: 400 }
      );
    }

    const existingPending = await PendingVerification.findOne({
      status: 'pending',
      $or: [
        { email: normalizedEmail },
        { rollNo: normalizedRollNo },
      ],
    }).lean();

    if (existingPending) {
      return NextResponse.json(
        {
          message: 'A manual verification request is already pending for this student.',
          verificationPhrase: existingPending.verificationPhrase,
          adminEmail: process.env.MANUAL_VERIFICATION_EMAIL || process.env.EMAIL_USER || '',
        },
        { status: 200 }
      );
    }

    let finalSupervisorId: mongoose.Types.ObjectId | null = null;

    if (safeSupervisorId) {
      const supervisor = await User.findOne({ _id: safeSupervisorId, role: 'supervisor' })
        .select('_id extraSlots')
        .lean();

      if (!supervisor) {
        return NextResponse.json({ error: 'Selected supervisor was not found.' }, { status: 404 });
      }

      const filledSlots = await getFilledSlots(safeSupervisorId);
      const maxSlots = getSupervisorMaxSlots(supervisor);

      if (filledSlots >= maxSlots) {
        return NextResponse.json(
          { error: `Selected supervisor has reached maximum capacity (${maxSlots} slots). Choose another supervisor or choose later.` },
          { status: 409 }
        );
      }

      finalSupervisorId = new mongoose.Types.ObjectId(safeSupervisorId);
    }

    const passwordHash = await bcrypt.hash(safePassword, 10);
    const verificationPhrase = buildManualVerificationPhrase(normalizedRollNo);

    const pendingVerification = await PendingVerification.create({
      name: safeName,
      email: normalizedEmail,
      rollNo: normalizedRollNo,
      passwordHash,
      program: safeProgram,
      batch: safeBatch,
      supervisorId: finalSupervisorId,
      verificationPhrase,
      status: 'pending',
    });

    return NextResponse.json(
      {
        message: 'Manual verification request created. Follow the on-screen Outlook email steps to complete verification.',
        requestId: pendingVerification._id,
        verificationPhrase,
        adminEmail: process.env.MANUAL_VERIFICATION_EMAIL || process.env.EMAIL_USER || '',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Manual Verification Request Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to create manual verification request. Please try again.' },
      { status: 500 }
    );
  }
}