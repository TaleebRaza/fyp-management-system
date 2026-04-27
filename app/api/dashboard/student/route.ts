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
          <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
            <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e4e4e7;">
              <div style="background-color: #18181b; padding: 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">FYP Portal Notification</h1>
              </div>
              <div style="padding: 32px;">
                <h2 style="margin-top: 0; color: #18181b; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">New Project Submission</h2>
                <p style="color: #71717a; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">A new Final Year Project proposal has been submitted and is awaiting your review.</p>
                
                <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 32px; border: 1px solid #e4e4e7;">
                  <p style="margin: 0 0 12px 0; font-size: 14px; color: #71717a;"><strong>Student:</strong> <span style="color: #18181b;">${updatedStudent.name} (${updatedStudent.rollNo})</span></p>
                  <p style="margin: 0 0 12px 0; font-size: 14px; color: #71717a;"><strong>Domain:</strong> <span style="color: #18181b;">${body.domain}</span></p>
                  <p style="margin: 0; font-size: 14px; color: #71717a;"><strong>Title:</strong> <span style="color: #18181b; font-weight: 600;">${body.title}</span></p>
                </div>

                <a href="${process.env.NEXTAUTH_URL}" style="display: block; text-align: center; background-color: #18181b; color: #ffffff; padding: 14px 0; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;">Log in to Review</a>
              </div>
            </div>
            <p style="text-align: center; color: #a1a1aa; font-size: 12px; margin-top: 24px;">This is an automated message from your University FYP System.</p>
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