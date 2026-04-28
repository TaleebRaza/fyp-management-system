import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import { sendNotificationEmail } from '../../../../lib/mailer';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    await connectToDatabase();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    
    const students = await User.find({ role: 'student', supervisorId: id }).lean();

    // --- NEW: Aggregation Layer - Group students by Project ID ---
    const projectMap = new Map();

    students.forEach((student: any) => {
      // Use the projectId as the key. If legacy, use their own ID to keep them isolated.
      const pId = student.projectId ? student.projectId.toString() : `legacy-${student._id.toString()}`;
      
      if (!projectMap.has(pId)) {
        projectMap.set(pId, {
          _id: pId, 
          triggerStudentId: student._id.toString(), // We keep one real student ID to trigger backend actions
          projectTitle: student.projectTitle,
          projectDesc: student.projectDesc,
          domain: student.domain,
          tools: student.tools,
          pdfUrl: student.pdfUrl,
          status: student.status,
          remarks: student.remarks,
          members: [] // Array to hold multiple students
        });
      }
      
      // Push this student's data into the shared project card
      projectMap.get(pId).members.push({
        _id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        email: student.email
      });
    });

    // Convert the Map back to an array for the frontend
    return NextResponse.json({ projects: Array.from(projectMap.values()) }, { status: 200 });
  } catch (error) {
    console.error('Supervisor Dashboard GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { action, studentId, status, remarks, migrationCode } = await req.json();

    if (action === 'updateStatus') {
      const triggerStudent = await User.findById(studentId);
      if (!triggerStudent) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

      const teamMembers = triggerStudent.projectId 
        ? await User.find({ projectId: triggerStudent.projectId }) 
        : [triggerStudent];

      await User.updateMany(
        { _id: { $in: teamMembers.map(m => m._id) } },
        { $set: { status, remarks } }
      );

      if (triggerStudent.projectId) {
        await Project.findByIdAndUpdate(triggerStudent.projectId, { $set: { status } });
      }
      
      // Email Notifications
      for (const member of teamMembers) {
        if (member.supervisorId && member.email) {
          const supervisor = await User.findById(member.supervisorId);
          if (supervisor && supervisor.notificationsEnabled !== false) {
            const subject = `FYP Project Status Update: ${status}`;
            const isApproved = status === 'Approved';
            const primaryColor = isApproved ? '#10b981' : '#ef4444'; 
            const bgColor = isApproved ? '#ecfdf5' : '#fef2f2';
            const borderColor = isApproved ? '#a7f3d0' : '#fecaca';

            const htmlContent = `
              <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: sans-serif;">
                <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
                  <div style="background-color: #18181b; padding: 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 20px;">FYP Portal Notification</h1>
                  </div>
                  <div style="padding: 32px;">
                    <h2 style="margin-top: 0; color: #18181b; font-size: 24px;">Project Status Updated</h2>
                    <p style="color: #71717a; margin-bottom: 24px;">Your supervisor, <strong>${supervisor.name}</strong>, has reviewed your team's recent submission.</p>
                    <div style="text-align: center; margin-bottom: 24px;">
                      <span style="display: inline-block; background-color: ${bgColor}; color: ${primaryColor}; border: 1px solid ${borderColor}; padding: 8px 16px; border-radius: 999px; font-weight: bold;">
                        Status: ${status}
                      </span>
                    </div>
                    <div style="background-color: #f8fafc; border-left: 4px solid ${primaryColor}; padding: 20px;">
                      <p style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Supervisor Remarks</p>
                      <p style="margin: 0; font-size: 15px; color: #334155; font-style: italic;">"${remarks || 'No additional remarks provided.'}"</p>
                    </div>
                  </div>
                </div>
              </div>
            `;
            await sendNotificationEmail(member.email, subject, htmlContent);
          }
        }
      }
      return NextResponse.json({ message: 'Status updated for the entire team!' }, { status: 200 });
    }

    if (action === 'migrate') {
      const targetSup = await User.findOne({ role: 'supervisor', migrationCode });
      if (!targetSup) return NextResponse.json({ error: 'Invalid Migration Code!' }, { status: 400 });
      
      const triggerStudent = await User.findById(studentId);
      if (!triggerStudent) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

      // --- Team-Aware Migration ---
      if (triggerStudent.projectId) {
        await Project.findByIdAndUpdate(triggerStudent.projectId, { $set: { supervisorId: targetSup._id } });
        await User.updateMany({ projectId: triggerStudent.projectId }, { $set: { supervisorId: targetSup._id } });
      } else {
        await User.findByIdAndUpdate(studentId, { $set: { supervisorId: targetSup._id } });
      }
      return NextResponse.json({ message: 'Team migrated successfully!' }, { status: 200 });
    }

    if (action === 'removeStudent') {
      const triggerStudent = await User.findById(studentId);
      if (!triggerStudent) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

      // --- Team-Aware Removal ---
      if (triggerStudent.projectId) {
        await Project.findByIdAndUpdate(triggerStudent.projectId, { $set: { supervisorId: null } });
        await User.updateMany(
          { projectId: triggerStudent.projectId },
          { $set: {
              supervisorId: null,
              status: 'Unassigned',
              projectTitle: '',
              projectDesc: '',
              pdfUrl: '',
              remarks: 'Your team was removed by the supervisor. Please select a new one.'
            }
          }
        );
      } else {
        await User.findByIdAndUpdate(studentId, {
          $set: { supervisorId: null, status: 'Unassigned', projectTitle: '', projectDesc: '', pdfUrl: '', remarks: 'You were removed.' }
        });
      }
      return NextResponse.json({ message: 'Team removed successfully!' }, { status: 200 });
    }

  } catch (error) {
    console.error('Supervisor Action Error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}