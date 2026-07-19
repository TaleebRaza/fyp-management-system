import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import Project from '../../../models/Project';
import { buildRollNoRegex, normalizeRollNo } from '../../../lib/rollNo';
import { isValidEmailAddress, normalizeEmailAddress } from '../../../lib/studentIdentity';
import { PROGRAM_MAP } from '../../../config/appSettings';
import { getSupervisorMaxSlots } from '../../../lib/supervisorSlots';
import { getSupervisorFilledSlots } from '../../../lib/supervisorCapacity';
import { calculateLateRegistrationFine } from '../../../lib/lateRegistrationFine';

const MIN_PASSWORD_LENGTH = 6;

export async function POST(req: Request) {
  try {
    const { name, email, rollNo, password, supervisorId, program, batch } = await req.json();
    const normalizedName = String(name || '').trim();
    const normalizedEmail = normalizeEmailAddress(email);
    const normalizedRollNo = normalizeRollNo(rollNo);
    const normalizedPassword = String(password || '');
    const normalizedProgram = String(program || 'BSCS').trim().toUpperCase();
    const normalizedBatch = String(batch || '').trim();

    if (!normalizedName || !normalizedEmail || !normalizedRollNo || !normalizedPassword || !normalizedBatch) {
      return NextResponse.json({ error: 'Name, email, roll number, password, and batch are required.' }, { status: 400 });
    }

    if (!isValidEmailAddress(normalizedEmail)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    if (normalizedPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.` }, { status: 400 });
    }

    if (!Object.prototype.hasOwnProperty.call(PROGRAM_MAP, normalizedProgram)) {
      return NextResponse.json({ error: 'Invalid program selected.' }, { status: 400 });
    }

    await connectToDatabase();

    const existingUser = await User.findOne({
      $or: [
        { email: normalizedEmail },
        { rollNo: normalizedRollNo },
        { rollNo: buildRollNoRegex(normalizedRollNo) },
      ],
    }).select('_id').lean();

    if (existingUser) {
      return NextResponse.json({ error: 'This roll number or email is already registered.' }, { status: 400 });
    }

    if (supervisorId) {
      if (!mongoose.Types.ObjectId.isValid(supervisorId)) {
        return NextResponse.json({ error: 'Invalid supervisor selected.' }, { status: 400 });
      }

      const supervisor = await User.findOne({ _id: supervisorId, role: 'supervisor' })
        .select('_id extraSlots')
        .lean();

      if (!supervisor) {
        return NextResponse.json({ error: 'Selected supervisor was not found.' }, { status: 404 });
      }

      const filledSlots = await getSupervisorFilledSlots(supervisorId);

      const maxSlots = getSupervisorMaxSlots(supervisor);
      if (filledSlots >= maxSlots) {
        return NextResponse.json(
          { error: `Registration failed. The selected supervisor has reached maximum capacity (${maxSlots} slots).` },
          { status: 409 }
        );
      }
    }

    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);
    const lateRegistrationAssessment = calculateLateRegistrationFine(new Date());
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const newStudent = new User({
        name: normalizedName,
        email: normalizedEmail,
        rollNo: normalizedRollNo,
        password: hashedPassword,
        role: 'student',
        program: normalizedProgram,
        batch: normalizedBatch,
        semester: '7th Semester',
        supervisorId: supervisorId || null,
        status: supervisorId ? 'Pending' : 'Unassigned',
        remarks: '',
        lateRegistrationDays: lateRegistrationAssessment.daysLate,
        lateRegistrationFine: lateRegistrationAssessment.fineAmount,
      });
      await newStudent.save({ session });

      const newProject = new Project({
        supervisorId: supervisorId || null,
        members: [newStudent._id],
        inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      });
      await newProject.save({ session });

      newStudent.projectId = newProject._id;
      await newStudent.save({ session });

      await session.commitTransaction();
      return NextResponse.json({ message: 'Registration successful! You can now sign in.' }, { status: 201 });
    } catch (transactionError: any) {
      if (session.inTransaction()) await session.abortTransaction();

      if (transactionError?.code === 11000) {
        return NextResponse.json({ error: 'This roll number or email is already registered.' }, { status: 400 });
      }

      throw transactionError;
    } finally {
      await session.endSession();
    }
  } catch (error: any) {
    console.error('Registration error:', error?.message || error);
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}
