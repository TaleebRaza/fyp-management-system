import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import { sendNotificationEmail } from '../../../../lib/mailer';
import { APP_SETTINGS } from '../../../../config/appSettings';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    await connectToDatabase();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    
    // OPTIMIZATION: Use .lean() for faster read-only queries
    const student = await User.findById(id).lean();
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    // OPTIMIZATION: Parallel execution. Fetch supervisor and project at the exact same time.
    const [supervisor, project] = await Promise.all([
      student.supervisorId ? User.findById(student.supervisorId).lean() : null,
      student.projectId ? Project.findById(student.projectId).populate('members', 'name rollNo email').lean() : null
    ]);

    return NextResponse.json({ student, supervisor, project }, { status: 200 });
  } catch (error) {
    console.error('Student Dashboard GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const body = await req.json();

    // ==========================================
    // ACTION: ASSIGN SUPERVISOR (Transaction Lock)
    // ==========================================
    if (body.action === 'assignSupervisor') {
      // 1. Start an Atomic Transaction Session to prevent race conditions
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        let filledSlots = 0;
        // 2. Count current slots WITH the session lock
        if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'STUDENT') {
          filledSlots = await User.countDocuments({ role: 'student', supervisorId: body.supervisorId }).session(session);
        } else if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'PROJECT') {
          filledSlots = await Project.countDocuments({ supervisorId: body.supervisorId }).session(session);
        }

        // 3. Strict Capacity Enforcement
        if (filledSlots >= APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json(
            { error: 'Cannot assign. The selected supervisor has reached maximum capacity.' }, 
            { status: 409 } // 409 Conflict is the correct HTTP status for a race condition rejection
          );
        }

        const triggeringStudent = await User.findById(body.id).session(session);
        if (!triggeringStudent) {
          await session.abortTransaction();
          session.endSession();
          return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

        const supObjectId = new mongoose.Types.ObjectId(body.supervisorId);

        // 4. Update Project and Team Members inside the locked session
        if (triggeringStudent.projectId) {
          await Project.findByIdAndUpdate(
            triggeringStudent.projectId, 
            { $set: { supervisorId: supObjectId } },
            { session }
          );

          await User.updateMany(
            { projectId: triggeringStudent.projectId },
            { $set: { supervisorId: supObjectId, status: 'Pending', remarks: '' } },
            { session }
          );
        } else {
          await User.findByIdAndUpdate(
            body.id, 
            { $set: { supervisorId: supObjectId, status: 'Pending', remarks: '' } },
            { session }
          );
        }

        // 5. Commit the transaction ONLY if no other request modified the count during our process
        await session.commitTransaction();
        session.endSession();
        return NextResponse.json({ message: 'Supervisor successfully assigned to your team!' }, { status: 200 });

      } catch (transactionError) {
        // Safe Fallback: Abort all changes if anything fails
        await session.abortTransaction();
        session.endSession();
        throw transactionError; 
      }
    }

    // ==========================================
    // ACTION: PROJECT SUBMISSION
    // ==========================================
    const triggeringStudent = await User.findById(body.id);
    if (!triggeringStudent) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const submissionData = {
      projectTitle: body.title,
      projectDesc: body.desc,
      domain: body.domain,
      tools: body.tools,
      pdfUrl: body.pdfUrl,
      status: 'Submitted For Review'
    };

    let updatedStudent = null;

    if (triggeringStudent.projectId) {
      // OPTIMIZATION: Run Project updates and Team updates in parallel to halve DB response time
      const [_, updatedUsers] = await Promise.all([
        Project.findByIdAndUpdate(triggeringStudent.projectId, {
          $set: { title: body.title, domain: body.domain, pdfUrl: body.pdfUrl }
        }),
        User.updateMany(
          { projectId: triggeringStudent.projectId },
          { $set: submissionData }
        )
      ]);
      updatedStudent = await User.findById(body.id); // Re-fetch to get supervisor ID
    } else {
      updatedStudent = await User.findByIdAndUpdate(body.id, { $set: submissionData }, { new: true });
    }

    // Trigger Supervisor Email Notification (Kept identical to prevent UI changes)
    if (updatedStudent && updatedStudent.supervisorId) {
      const supervisor = await User.findById(updatedStudent.supervisorId);
      if (supervisor && supervisor.email && supervisor.notificationsEnabled !== false) {
        const subject = `New FYP Project Submitted: ${updatedStudent.name}`;
        const htmlContent = `
          <div style="background-color: #f4f4f5; padding: 40px 20px; font-family: sans-serif;">
            <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
              <div style="background-color: #18181b; padding: 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 20px;">FYP Portal Notification</h1>
              </div>
              <div style="padding: 32px;">
                <h2 style="margin-top: 0; color: #18181b; font-size: 24px;">New Project Submission</h2>
                <p style="color: #71717a; margin-bottom: 24px;">A new Final Year Project proposal has been submitted.</p>
                <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
                  <p style="margin: 0 0 12px 0;"><strong>Submitted By:</strong> ${updatedStudent.name}</p>
                  <p style="margin: 0 0 12px 0;"><strong>Domain:</strong> ${body.domain}</p>
                  <p style="margin: 0;"><strong>Title:</strong> ${body.title}</p>
                </div>
              </div>
            </div>
          </div>
        `;
        await sendNotificationEmail(supervisor.email, subject, htmlContent);
      }
    }

    return NextResponse.json({ message: 'Project Submitted!' }, { status: 200 });
  } catch (error) {
    console.error('Student Dashboard API Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}