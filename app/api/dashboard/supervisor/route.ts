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

    // --- NEW: Fetch associated projects to get the Timeline Stage ---
    const projectIds = students.map(s => s.projectId).filter(Boolean);
    const projects = await Project.find({ _id: { $in: projectIds } }).lean();
    const stageMap = projects.reduce((acc: any, p: any) => {
      acc[p._id.toString()] = p.stage;
      return acc;
    }, {});
    // --------------------------------------------------------------

    const projectMap = new Map();

    students.forEach((student: any) => {
      const pId = student.projectId ? student.projectId.toString() : `legacy-${student._id.toString()}`;
      
      if (!projectMap.has(pId)) {
        projectMap.set(pId, {
          _id: pId, 
          triggerStudentId: student._id.toString(),
          projectTitle: student.projectTitle,
          projectDesc: student.projectDesc,
          domain: student.domain,
          tools: student.tools,
          pdfUrl: student.pdfUrl,
          status: student.status,
          remarks: student.remarks,
          stage: stageMap[pId] || 'PROPOSAL', // <-- Inject the stage here
          batch: student.batch || 'N/A',
          semester: student.semester || '7th Semester',
          members: []
        });
      }
      
      projectMap.get(pId).members.push({
        _id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        email: student.email
      });
    });

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

      let finalStatus = status;
      let newStage: string | undefined = undefined;
      let notificationMessage = `Status: ${status}`;

      // --- NEW: Timeline Progression Logic ---
      if (status === 'Approved' && triggerStudent.projectId) {
        const project = await Project.findById(triggerStudent.projectId);
        
        if (project.stage === 'PROPOSAL') {
          newStage = 'THESIS_DRAFT';
          finalStatus = 'Pending'; 
          notificationMessage = 'Proposal Approved! Please begin uploading your Thesis Chapters.';
        } else if (project.stage === 'THESIS_DRAFT') {
          newStage = 'FINAL_DELIVERABLES';
          finalStatus = 'Pending';
          notificationMessage = 'Thesis Approved! Please submit your Final Deliverables.';
        } else {
          // If they are on FINAL_DELIVERABLES, they are completely done.
          finalStatus = 'Approved';
          notificationMessage = 'Congratulations! Your FYP is fully Approved and completed.';
        }
      }
      // ---------------------------------------

      // 1. Update the Users
      await User.updateMany(
        { _id: { $in: teamMembers.map(m => m._id) } },
        { $set: { 
            status: finalStatus, 
            remarks: remarks || notificationMessage,
            // Reset the PDF URL if they advanced a stage, so the form expects a new file
            ...(newStage ? { pdfUrl: '' } : {}) 
          } 
        }
      );

      // 2. Update the Project Document
      if (triggerStudent.projectId) {
        await Project.findByIdAndUpdate(triggerStudent.projectId, { 
          $set: { 
            status: finalStatus,
            ...(newStage ? { stage: newStage, pdfUrl: '' } : {})
          } 
        });
      }
      
      // 3. Email Notifications (Parallelized for Speed)
      const emailPromises = teamMembers.map(async (member) => {
        if (member.supervisorId && member.email) {
          const supervisor = await User.findById(member.supervisorId);
          if (supervisor && supervisor.notificationsEnabled !== false) {
            const subject = `FYP Project Update: ${newStage ? 'Stage Advanced!' : status}`;
            const primaryColor = status === 'Approved' ? '#10b981' : status === 'Changes Requested' ? '#f59e0b' : '#ef4444'; 
            const bgColor = status === 'Approved' ? '#ecfdf5' : status === 'Changes Requested' ? '#fffbeb' : '#fef2f2';

            const htmlContent = `
              <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: sans-serif;">
                <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
                  <div style="background-color: #18181b; padding: 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 20px;">FYP Portal Notification</h1>
                  </div>
                  <div style="padding: 32px;">
                    <h2 style="margin-top: 0; color: #18181b; font-size: 24px;">Project Updated</h2>
                    <p style="color: #71717a; margin-bottom: 24px;">Your supervisor, <strong>${supervisor.name}</strong>, has reviewed your submission.</p>
                    <div style="text-align: center; margin-bottom: 24px;">
                      <span style="display: inline-block; background-color: ${bgColor}; color: ${primaryColor}; padding: 8px 16px; border-radius: 999px; font-weight: bold;">
                        ${notificationMessage}
                      </span>
                    </div>
                    <div style="background-color: #f8fafc; border-left: 4px solid ${primaryColor}; padding: 20px;">
                      <p style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Supervisor Remarks</p>
                      <p style="margin: 0; font-size: 15px; color: #334155; font-style: italic;">"${remarks || 'Proceed to the next stage.'}"</p>
                    </div>
                  </div>
                </div>
              </div>
            `;
            return sendNotificationEmail(member.email, subject, htmlContent);
          }
        }
      });

      // Execute all emails at the exact same time
      await Promise.all(emailPromises);
      return NextResponse.json({ message: 'Status updated and timeline advanced!' }, { status: 200 });
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