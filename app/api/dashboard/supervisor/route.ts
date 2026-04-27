import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { sendNotificationEmail } from '../../../../lib/mailer';

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
      const student = await User.findByIdAndUpdate(studentId, { status, remarks });
      
      if (student && student.supervisorId && student.email) {
        const supervisor = await User.findById(student.supervisorId);
        
        if (supervisor && supervisor.notificationsEnabled !== false) {
          const subject = `FYP Project Status Update: ${status}`;
          const statusColor = status === 'Approved' ? '#10b981' : '#ef4444'; 
          // Dynamic styling based on the strict status
          const isApproved = status === 'Approved';
          const primaryColor = isApproved ? '#10b981' : '#ef4444'; // Emerald for Approved, Rose for Rejected
          const bgColor = isApproved ? '#ecfdf5' : '#fef2f2';
          const borderColor = isApproved ? '#a7f3d0' : '#fecaca';

          const htmlContent = `
            <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
              <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e4e4e7;">
                <div style="background-color: #18181b; padding: 24px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">FYP Portal Notification</h1>
                </div>
                <div style="padding: 32px;">
                  <h2 style="margin-top: 0; color: #18181b; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Project Status Updated</h2>
                  <p style="color: #71717a; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">Your supervisor, <strong>${supervisor.name}</strong>, has reviewed your recent submission.</p>
                  
                  <div style="text-align: center; margin-bottom: 24px;">
                    <span style="display: inline-block; background-color: ${bgColor}; color: ${primaryColor}; border: 1px solid ${borderColor}; padding: 8px 16px; border-radius: 999px; font-weight: 700; font-size: 14px; letter-spacing: 0.5px; text-transform: uppercase;">
                      Status: ${status}
                    </span>
                  </div>

                  <div style="background-color: #f8fafc; border-left: 4px solid ${primaryColor}; border-radius: 0 8px 8px 0; padding: 20px; margin-bottom: 32px;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Supervisor Remarks</p>
                    <p style="margin: 0; font-size: 15px; color: #334155; line-height: 1.6; font-style: italic;">"${remarks || 'No additional remarks provided.'}"</p>
                  </div>

                  <a href="${process.env.NEXTAUTH_URL}" style="display: block; text-align: center; background-color: #18181b; color: #ffffff; padding: 14px 0; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;">View Dashboard</a>
                </div>
              </div>
              <p style="text-align: center; color: #a1a1aa; font-size: 12px; margin-top: 24px;">This is an automated message from your University FYP System.</p>
            </div>
          `;
          await sendNotificationEmail(student.email, subject, htmlContent);
        }
      }

      return NextResponse.json({ message: 'Status updated!' }, { status: 200 });
    }

    if (action === 'migrate') {
      const targetSup = await User.findOne({ role: 'supervisor', migrationCode });
      if (!targetSup) return NextResponse.json({ error: 'Invalid Migration Code!' }, { status: 400 });
      await User.findByIdAndUpdate(studentId, { supervisorId: targetSup._id });
      return NextResponse.json({ message: 'Migrated successfully!' }, { status: 200 });
    }

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