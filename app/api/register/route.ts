import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import Project from '../../../models/Project';
import { APP_SETTINGS } from '../../../config/appSettings';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const { name, email, rollNo, password, supervisorId, program, batch } = await req.json();

    if (!name || !rollNo || !password || !batch) {
      return NextResponse.json({ error: 'Missing required fields, including Batch.' }, { status: 400 });
    }

    if (email && !/^[a-zA-Z0-9._%+-]+@uoh\.edu\.pk$/.test(email)) {
      return NextResponse.json({ error: 'Only university emails are allowed (e.g. f23-0201@uoh.edu.pk)' }, { status: 400 });
    }

    await connectToDatabase();

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      if (supervisorId) {
        let filledSlots = 0;
        if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'STUDENT') {
          filledSlots = await User.countDocuments({ role: 'student', supervisorId }).session(session);
        } else if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'PROJECT') {
          filledSlots = await Project.countDocuments({ supervisorId }).session(session);
        }

        if (filledSlots >= APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json(
            { error: 'Registration failed. The selected supervisor has reached maximum capacity.' },
            { status: 409 }
          );
        }
      }

      const hashedPassword = await bcrypt.hash(password, 10);

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
        status: 'Pending'
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