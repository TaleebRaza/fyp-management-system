import { NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import Project from '../../../models/Project';
import { APP_SETTINGS } from '../../../config/appSettings';

export async function POST(req: Request) {
  try {
    // 1. Add 'program' to the destructured JSON payload
    const { name, email, rollNo, password, supervisorId, program } = await req.json();
    await connectToDatabase();
    
    const existingUser = await User.findOne({ 
      $or: [{ rollNo }, { email }] 
    });
    
    if (existingUser) {
      return NextResponse.json({ error: 'This Roll Number or Email is already registered!' }, { status: 400 });
    }

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
          { status: 403 }
        );
      }
    }
    
    // 2. Pass 'program' into the new User schema
    const newStudent = new User({
      name,
      email,
      rollNo,
      password,
      role: 'student',
      program: program || 'BSCS', // Fallback safety
      supervisorId: supervisorId || null,
      status: 'Pending'
    });
    await newStudent.save();

    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newProject = new Project({
      supervisorId: supervisorId || null,
      members: [newStudent._id],
      inviteCode: inviteCode
    });
    await newProject.save();

    newStudent.projectId = newProject._id;
    await newStudent.save();

    return NextResponse.json({ message: 'Registration successful!' }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}