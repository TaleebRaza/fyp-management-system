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
          const htmlContent = `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2 style="color: #333;">Your FYP Project has been updated</h2>
              <p>Your supervisor, <strong>${supervisor.name}</strong>, has reviewed your project.</p>
              <p><strong>New Status:</strong> <span style="color: ${statusColor}; font-weight: bold; padding: 4px 8px; border-radius: 4px; background-color: ${statusColor}20;">${status}</span></p>
              <p><strong>Remarks:</strong></p>
              <blockquote style="border-left: 4px solid #cbd5e1; padding-left: 16px; color: #475569; margin-left: 0; background-color: #f8fafc; padding: 12px;">
                ${remarks}
              </blockquote>
              <p style="margin-top: 20px;">Please log in to your FYP Portal for full details.</p>
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