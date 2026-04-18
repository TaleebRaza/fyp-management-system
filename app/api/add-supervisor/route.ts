import { NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';

export async function POST(req: Request) {
  try {
    // Destructure email alongside existing fields
    const { name, email, rollNo, password, migrationCode } = await req.json();
    await connectToDatabase();
    
    const existingUser = await User.findOne({ 
      $or: [{ rollNo }, { email }] 
    });
    
    if (existingUser) {
      return NextResponse.json({ error: 'This Username/ID or Email already exists!' }, { status: 400 });
    }
    
    const newSupervisor = new User({
      name,
      email, // Save the new email field
      rollNo,
      password,
      role: 'supervisor',
      migrationCode,
      notificationsEnabled: true // Ensure emails are active by default
    });
    
    await newSupervisor.save();
    return NextResponse.json({ message: 'Supervisor added successfully!' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to add supervisor.' }, { status: 500 });
  }
}