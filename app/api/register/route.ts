import { NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';

export async function POST(req: Request) {
  try {
    // Destructure email alongside existing fields
    const { name, email, rollNo, password, supervisorId } = await req.json();
    await connectToDatabase();
    
    // Check if either rollNo or email already exists
    const existingUser = await User.findOne({ 
      $or: [{ rollNo }, { email }] 
    });
    
    if (existingUser) {
      return NextResponse.json({ error: 'This Roll Number or Email is already registered!' }, { status: 400 });
    }
    
    const newStudent = new User({
      name,
      email, // Save the new email field
      rollNo,
      password,
      role: 'student',
      supervisorId,
      status: 'Pending'
    });
    
    await newStudent.save();
    return NextResponse.json({ message: 'Registration successful!' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}