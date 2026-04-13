import { NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';

export async function POST(req: Request) {
  try {
    const { name, rollNo, password, supervisorId } = await req.json();
    await connectToDatabase();

    // 1. Check if the Roll Number is already taken
    const existingUser = await User.findOne({ rollNo });
    if (existingUser) {
      return NextResponse.json({ error: 'This Roll Number is already registered!' }, { status: 400 });
    }

    // 2. Create the new student
    const newStudent = new User({
      name,
      rollNo,
      password, // (Note: We will encrypt this later)
      role: 'student',
      supervisorId,
      status: 'Pending'
    });

    // 3. Save to MongoDB
    await newStudent.save();

    return NextResponse.json({ message: 'Registration successful!' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}