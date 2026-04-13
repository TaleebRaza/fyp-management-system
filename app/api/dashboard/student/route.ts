import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';

export async function GET(req: Request) {
  try {
    await connectToDatabase();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    const student = await User.findById(id);
    const supervisor = student.supervisorId ? await User.findById(student.supervisorId) : null;

    return NextResponse.json({ student, supervisor }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const body = await req.json();

    if (body.action === 'assignSupervisor') {
       await User.findByIdAndUpdate(body.id, { 
         supervisorId: body.supervisorId, 
         status: 'Pending', 
         remarks: '' 
       });
       return NextResponse.json({ message: 'Supervisor Assigned!' }, { status: 200 });
    }

    // Ensure the database maps the newly defined fields properly
    await User.findByIdAndUpdate(body.id, {
      projectTitle: body.title,
      projectDesc: body.desc,
      domain: body.domain, // Safely saved now!
      tools: body.tools,   // Safely saved now!
      pdfUrl: body.pdfUrl,
      status: 'Submitted For Review'
    });

    return NextResponse.json({ message: 'Project Submitted!' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}