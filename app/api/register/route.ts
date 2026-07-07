import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import Project from '../../../models/Project';
import Otp from '../../../models/Otp';
import { APP_SETTINGS } from '../../../config/appSettings';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const { name, email, rollNo, password, supervisorId, program, batch, otp } = await req.json();

    if (!name || !rollNo || !password || !batch || !email || !otp) {
      return NextResponse.json({ error: 'Missing required fields, including verification code payload.' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9._%+-]+@(student\.)?uoh\.edu\.pk$/.test(email)) {
      return NextResponse.json({ error: 'Only university emails are allowed (e.g. f23-0201@student.uoh.edu.pk)' }, { status: 400 });
    }

    await connectToDatabase();

    // 1. Strictly validate OTP before executing heavy database tasks
    const otpRecord = await Otp.findOne({ email });
    if (!otpRecord || otpRecord.code !== otp) {
      return NextResponse.json({ error: 'Invalid verification code provided.' }, { status: 400 });
    }

    // 2. Secondary program manual validation ensuring timestamp boundaries (15 mins = 900,000 ms)
    if (Date.now() - new Date(otpRecord.createdAt).getTime() > 900000) {
      await Otp.findOneAndDelete({ email });
      return NextResponse.json({ error: 'Verification code has expired. Please request a fresh token.' }, { status: 400 });
    }

    // --- OPTIMIZATION: Pre-Flight Capacity Validation ---
    // Perform database lookups outside the transaction lock to avoid thread starvation
    if (supervisorId) {
      let filledSlots = 0;
      if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'STUDENT') {
        filledSlots = await User.countDocuments({ role: 'student', supervisorId });
      } else if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'PROJECT') {
        filledSlots = await Project.countDocuments({ supervisorId });
      }

      if (filledSlots >= APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR) {
        return NextResponse.json(
          { error: 'Registration failed. The selected supervisor has reached maximum capacity.' },
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
        email: email || undefined,
        rollNo,
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
      await Otp.findOneAndDelete({ email });

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