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

function getAdminEmail() {
  return process.env.MANUAL_VERIFICATION_EMAIL || process.env.EMAIL_USER || '';
}

function buildManualMailDetails(rollNo: string, phrase: string) {
  const subject = `FYP Portal Verification - ${rollNo}`;
  const body = `My roll number is ${rollNo}. My verification phrase is: ${phrase}`;

  return {
    subject,
    body,
  };
}

function buildStatusMessage(status: string) {
  if (status === 'approved') {
    return 'Your manual verification has been approved. Your account is ready. You can sign in now.';
  }

  if (status === 'action_required') {
    return 'Admin has updated your request. Read the remark below and send the same Outlook email again if needed.';
  }

  if (status === 'rejected') {
    return 'Your manual verification request was rejected. Read the admin remark below.';
  }

  return 'Your manual verification request is already pending. Use the same email details shown below.';
}

function serializeManualVerification(request: any) {
  const mailDetails = buildManualMailDetails(request.rollNo, request.verificationPhrase);

  return {
    message: buildStatusMessage(request.status),
    requestId: request._id,
    status: request.status,
    adminRemark: request.adminRemark || request.rejectionReason || '',
    rejectionReason: request.rejectionReason || '',
    verificationPhrase: request.verificationPhrase,
    adminEmail: getAdminEmail(),
    emailSubject: mailDetails.subject,
    emailBody: mailDetails.body,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    approvedAt: request.approvedAt,
    rejectedAt: request.rejectedAt,
  };
}

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

    const existingRequest = await PendingVerification.findOne({
      $or: [
        { email: normalizedEmail },
        { rollNo: normalizedRollNo },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    if (existingRequest) {
      return NextResponse.json(serializeManualVerification(existingRequest), { status: 200 });
    }

    const existingUser = await User.findOne({
      $or: [
        { email: normalizedEmail },
        { rollNo: normalizedRollNo },
        { rollNo: buildRollNoRegex(normalizedRollNo) },
      ],
    }).select('_id');

    if (existingUser) {
      return NextResponse.json(
        { error: 'This Roll Number or Email is already registered. Try signing in instead.' },
        { status: 400 }
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
      adminRemark: '',
    });

    return NextResponse.json(
      {
        ...serializeManualVerification(pendingVerification),
        message: 'Manual verification request created. Follow the on-screen Outlook email steps to complete verification.',
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