import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import { buildRollNoRegex, normalizeRollNo } from '../../../lib/rollNo';
import {
  UNIVERSITY_EMAIL_PATTERN,
  doesRollNoMatchUniversityEmail,
  getExpectedUniversityEmailExample,
  normalizeUniversityEmail,
} from '../../../lib/studentIdentity';
import Project from '../../../models/Project';
import Otp from '../../../models/Otp';
import PendingVerification from '../../../models/PendingVerification';
import { APP_SETTINGS } from '../../../config/appSettings';
import { getSupervisorMaxSlots } from '../../../lib/supervisorSlots';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const { name, email, rollNo, password, supervisorId, program, batch, otp } = await req.json();
    const normalizedEmail = normalizeUniversityEmail(email);
    const normalizedRollNo = normalizeRollNo(rollNo);

    if (!name || !normalizedRollNo || !password || !batch || !normalizedEmail || !otp) {
      return NextResponse.json({ error: 'Missing required fields, including verification code payload.' }, { status: 400 });
    }

    if (!UNIVERSITY_EMAIL_PATTERN.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Only university emails are allowed (e.g. f23-0201@student.uoh.edu.pk)' }, { status: 400 });
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

    // 1. Strictly validate OTP before executing heavy database tasks
    const otpRecord = await Otp.findOne({ email: normalizedEmail });
    if (!otpRecord || otpRecord.code !== otp) {
      return NextResponse.json({ error: 'Invalid verification code provided.' }, { status: 400 });
    }

    // 2. Secondary program manual validation ensuring timestamp boundaries (15 mins = 900,000 ms)
    if (Date.now() - new Date(otpRecord.createdAt).getTime() > 900000) {
      await Otp.findOneAndDelete({ email: normalizedEmail });
      return NextResponse.json({ error: 'Verification code has expired. Please request a fresh token.' }, { status: 400 });
    }

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

    // --- OPTIMIZATION: Pre-Flight Capacity Validation ---
    // Perform database lookups outside the transaction lock to avoid thread starvation
    if (supervisorId) {
      const supervisor = await User.findOne({ _id: supervisorId, role: 'supervisor' })
        .select('_id extraSlots')
        .lean();

      if (!supervisor) {
        return NextResponse.json({ error: 'Selected supervisor was not found.' }, { status: 404 });
      }

      let filledSlots = 0;
      if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'STUDENT') {
        filledSlots = await User.countDocuments({ role: 'student', supervisorId });
      } else if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'PROJECT') {
        filledSlots = await Project.countDocuments({ supervisorId });
      }

      const maxSlots = getSupervisorMaxSlots(supervisor);

      if (filledSlots >= maxSlots) {
        return NextResponse.json(
          { error: `Registration failed. The selected supervisor has reached maximum capacity (${maxSlots} slots).` },
          { status: 409 }
        );
      }
    }

    // --- OPTIMIZATION: Decoupled Cryptographic Hashing ---
    // Execute CPU-heavy string processing completely outside the transaction lock
    const hashedPassword = await bcrypt.hash(password, 10);

    // --- OPTIMIZATION: Lightning-Fast Atomic Transaction ---
    // The session lock now encapsulates pure write pipelines lasting under 50ms
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const newStudent = new User({
        name,
        email: normalizedEmail || undefined,
        rollNo: normalizedRollNo,
        password: hashedPassword,
        role: 'student',
        program: program || 'BSCS',
        batch,
        semester: '7th Semester',
        supervisorId: supervisorId || null,
        // Direct assignment: supervisor selection is final when capacity is available.
        status: supervisorId ? 'Pending' : 'Unassigned',
        remarks: ''
      });
      await newStudent.save({ session });

      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const newProject = new Project({
        supervisorId: supervisorId || null,
        members: [newStudent._id],
        inviteCode: inviteCode
      });
      await newProject.save({ session });

      newStudent.projectId = newProject._id;
      await newStudent.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Cleanly purge verified code to prevent replays (Post-transaction clean up)
      await Otp.findOneAndDelete({ email: normalizedEmail });
      await PendingVerification.updateMany(
        {
          status: 'pending',
          $or: [{ email: normalizedEmail }, { rollNo: normalizedRollNo }],
        },
        {
          $set: {
            status: 'approved',
            approvedAt: new Date(),
            rejectionReason: 'Verified through OTP before manual approval was needed.',
          },
        }
      );

      return NextResponse.json({ message: 'Registration successful!' }, { status: 201 });

    } catch (transactionError: any) {
      await session.abortTransaction();
      session.endSession();

      if (transactionError.code === 11000) {
        return NextResponse.json({ error: 'This Roll Number or Email is already registered!' }, { status: 400 });
      }
      throw transactionError;
    }

  } catch (error: any) {
    console.error('Registration error:', error.message);
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}