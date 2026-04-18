import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { sendNotificationEmail } from '../../../../lib/mailer';

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

    const updatedStudent = await User.findByIdAndUpdate(body.id, {
      projectTitle: body.title,
      projectDesc: body.desc,
      domain: body.domain,
      tools: body.tools,
      pdfUrl: body.pdfUrl,
      status: 'Submitted For Review'
    }, { new: true });

    if (updatedStudent && updatedStudent.supervisorId) {
      const supervisor = await User.findById(updatedStudent.supervisorId);
      
      if (supervisor && supervisor.email && supervisor.notificationsEnabled !== false) {
        const subject = `New FYP Project Submitted: ${updatedStudent.name}`;
        const htmlContent = `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2 style="color: #333;">New Project Submission</h2>
            <p><strong>Student:</strong> ${updatedStudent.name} (${updatedStudent.rollNo})</p>
            <p><strong>Title:</strong> ${body.title}</p>
            <p><strong>Domain:</strong> ${body.domain}</p>
            <p style="margin-top: 20px;">Please log in to your FYP Portal to review and approve or reject this submission.</p>
          </div>
        `;
        await sendNotificationEmail(supervisor.email, subject, htmlContent);
      }
    }

    return NextResponse.json({ message: 'Project Submitted!' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}