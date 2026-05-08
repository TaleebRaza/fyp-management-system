import { NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import bcrypt from 'bcryptjs'; // NEW: Import secure hashing library

export async function POST(req: Request) {
  try {
    const { name, email, rollNo, password, migrationCode } = await req.json();

    // 1. Basic validation to prevent empty payloads reaching the database
    if (!name || !email || !rollNo || !password) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    await connectToDatabase();
    
    // 2. Hash the password before it ever touches the database
    // Using 10 salt rounds provides a strong balance between security and performance
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 3. We skip the slow `findOne` query to prevent race conditions and save DB reads.
    // MongoDB will handle uniqueness atomically via indexes.
    const newSupervisor = new User({
      name,
      email, 
      rollNo,
      password: hashedPassword, // SECURE: Save the hashed version, not the plaintext
      role: 'supervisor',
      migrationCode,
      notificationsEnabled: true
    });
    
    // 4. Attempt to save directly
    await newSupervisor.save();
    
    return NextResponse.json({ message: 'Supervisor added successfully!' }, { status: 201 });
    
  } catch (error: any) {
    // 5. Catch the atomic MongoDB Duplicate Key Error (E11000)
    // This perfectly handles race conditions if two requests hit at the exact same time.
    if (error.code === 11000) {
      return NextResponse.json({ error: 'This Username/ID or Email already exists!' }, { status: 400 });
    }
    
    // Log the actual error for debugging, but hide it from the client
    console.error("API Error [add-supervisor]:", error.message);
    return NextResponse.json({ error: 'Failed to add supervisor.' }, { status: 500 });
  }
}