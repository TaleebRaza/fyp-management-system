import { NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';

export async function POST(req: Request) {
  try {
    const { name, rollNo, password, migrationCode } = await req.json();
    await connectToDatabase();

    // 1. Check if the Username/ID is already taken
    const existingUser = await User.findOne({ rollNo });
    if (existingUser) {
      return NextResponse.json({ error: 'This Username/ID already exists!' }, { status: 400 });
    }

    // 2. Create the new supervisor
    const newSupervisor = new User({
      name,
      rollNo,
      password,
      role: 'supervisor',
      migrationCode
    });

    // 3. Save to MongoDB
    await newSupervisor.save();

    return NextResponse.json({ message: 'Supervisor added successfully!' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to add supervisor.' }, { status: 500 });
  }
}