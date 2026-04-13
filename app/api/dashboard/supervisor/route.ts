import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';

export async function GET(req: Request) {
  try {
    await connectToDatabase();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    const students = await User.find({ role: 'student', supervisorId: id });
    return NextResponse.json({ students }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { action, studentId, status, remarks, migrationCode } = await req.json();

    if (action === 'updateStatus') {
      await User.findByIdAndUpdate(studentId, { status, remarks });
      return NextResponse.json({ message: 'Status updated!' }, { status: 200 });
    }

    if (action === 'migrate') {
      const targetSup = await User.findOne({ role: 'supervisor', migrationCode });
      if (!targetSup) return NextResponse.json({ error: 'Invalid Migration Code!' }, { status: 400 });
      await User.findByIdAndUpdate(studentId, { supervisorId: targetSup._id });
      return NextResponse.json({ message: 'Migrated successfully!' }, { status: 200 });
    }

    // The Remove Student Action
    if (action === 'removeStudent') {
      await User.findByIdAndUpdate(studentId, { 
        supervisorId: null, 
        status: 'Unassigned', 
        projectTitle: '', 
        projectDesc: '', 
        pdfUrl: '',
        remarks: 'You were removed by your previous supervisor. Please choose a new one.' 
      });
      return NextResponse.json({ message: 'Student removed successfully!' }, { status: 200 });
    }

  } catch (error) {
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}