import { NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';

// This is a GET request handler. It runs when someone visits this URL in their browser.
export async function GET() {
  try {
    // 1. Connect to our MongoDB Cloud Database
    await connectToDatabase();

    // 2. Ask the database: "Do you already have a user with the role of 'admin'?"
    const existingAdmin = await User.findOne({ role: 'admin' });
    
    // 3. If an admin already exists, stop and tell us.
    if (existingAdmin) {
      return NextResponse.json({ message: 'Admin already exists in the database!' }, { status: 200 });
    }

    // 4. If no admin exists, use our Blueprint (UserSchema) to create one
    const newAdmin = new User({
      name: 'System Admin',
      rollNo: 'admin',
      password: 'password123', // Note: In a production app, we would encrypt this!
      role: 'admin'
    });

    // 5. Save it permanently to the cloud
    await newAdmin.save();

    return NextResponse.json({ message: '✅ Database initialized! Admin account successfully created in MongoDB.' }, { status: 201 });

  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json({ error: 'Failed to initialize database. Check your terminal for details.' }, { status: 500 });
  }
}