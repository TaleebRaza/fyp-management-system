import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import Project from '../../../models/Project';
import { APP_SETTINGS } from '../../../config/appSettings';
import bcrypt from 'bcryptjs'; // NEW: Import the bcrypt library

export async function POST(req: Request) {
  try {
    const { name, email, rollNo, password, supervisorId, program } = await req.json();
    
    if (!name || !rollNo || !password) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
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
      
      // NEW: Hash the password before saving it to the database.
      // The '10' is the salt rounds, which determines how computationally heavy the encryption is.
      const hashedPassword = await bcrypt.hash(password, 10);

      const newStudent = new User({
        name,
        email: email || undefined, 
        rollNo,
        password: hashedPassword, // Save the scrambled hash, NOT the plaintext string
        role: 'student',
        program: program || 'BSCS',
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