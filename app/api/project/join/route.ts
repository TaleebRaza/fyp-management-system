// app/api/project/join/route.ts
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import { withTransactionRetry } from '../../../../lib/transactionUtils';

export async function POST(req: Request) {
  try {
    const { studentId, inviteCode } = await req.json();
    await connectToDatabase();

    // Fetch the joining student OUTSIDE the transaction because their core identity doesn't change
    const student = await User.findById(studentId);
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    // Initialize the formal MongoDB Session
    const session = await mongoose.startSession();

    try {
      // Execute the logic inside our robust retry wrapper
      return await withTransactionRetry(session, async () => {
        
        // 1. Find the target project (Locking it inside the transaction)
        const targetProject = await Project.findOne({ inviteCode: inviteCode.toUpperCase() }).session(session);
        if (!targetProject) {
          return NextResponse.json({ error: 'Invalid Invite Code! Please check the code and try again.' }, { status: 404 });
        }

        // 2. Limit and Redundancy Checks
        const capacity = targetProject.maxTeamSize || 2;
        if (targetProject.members.length >= capacity) {
          return NextResponse.json({ error: `This team is already full (Max ${capacity} members).` }, { status: 400 });
        }
        if (targetProject.members.includes(studentId)) {
          return NextResponse.json({ error: 'You are already in this team.' }, { status: 400 });
        }

        // 3. Program & Batch Matching & Fetching Teammate State
        let firstMember = null;
        if (targetProject.members.length > 0) {
          firstMember = await User.findById(targetProject.members[0]).session(session);
          if (firstMember) {
            if (firstMember.program !== student.program) {
              return NextResponse.json({ 
                error: `Program Mismatch! You are in ${student.program}, but this team belongs to ${firstMember.program} students.` 
              }, { status: 403 });
            }
            if (firstMember.batch !== student.batch) {
              return NextResponse.json({ 
                error: `Batch Mismatch! You are in ${student.batch || 'an unknown batch'}, but this team belongs to ${firstMember.batch || 'another batch'} students.` 
              }, { status: 403 });
            }

            // --- OPTIMIZATION: Absolute Capacity Firewall Check ---
            if (firstMember.supervisorId) {
              const { APP_SETTINGS } = await import('../../../../config/appSettings');
              
              // Only block the join if we are counting by individual STUDENTS.
              // If we are counting by PROJECT, this project already exists and is already counted.
              // Adding a member to an existing project does not consume an extra project slot.
              if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'STUDENT') {
                const currentFilledSlots = await User.countDocuments({ 
                  role: 'student', 
                  supervisorId: firstMember.supervisorId 
                }).session(session);
                
                if (currentFilledSlots >= APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR) {
                  return NextResponse.json({ 
                    error: 'Capacity Firewall: The supervisor assigned to this team has reached their absolute student limit.' 
                  }, { status: 409 });
                }
              }
            }
          }
        }

        // 4. ATOMIC UPDATE (Replaces the fragile optimistic concurrency logic)
        targetProject.members.push(studentId);
        await targetProject.save({ session });

        // 5. Ghost Data Purge
        if (student.projectId && student.projectId.toString() !== targetProject._id.toString()) {
          const oldProject = await Project.findById(student.projectId).session(session);
          if (oldProject) {
            if (oldProject.members.length === 1 && oldProject.members[0].toString() === studentId) {
              await Project.findByIdAndDelete(student.projectId, { session });
            } else {
              await Project.findByIdAndUpdate(student.projectId, {
                $pull: { members: studentId }
              }, { session });
            }
          }
        }

        // 6. Inherit EVERY piece of state from the existing teammate
        student.projectId = targetProject._id;
        
        if (firstMember) {
          student.supervisorId = firstMember.supervisorId;
          student.status = firstMember.status;
          student.remarks = firstMember.remarks;
          student.projectTitle = firstMember.projectTitle;
          student.projectDesc = firstMember.projectDesc;
          student.domain = firstMember.domain;
          student.tools = firstMember.tools;
          student.pdfUrl = firstMember.pdfUrl;
        } else {
          student.supervisorId = targetProject.supervisorId;
        }

        await student.save({ session });

        return NextResponse.json({ message: 'Successfully joined the team!' }, { status: 200 });
      });
    } finally {
      // Ensure the session is always closed to prevent memory leaks
      session.endSession();
    }

  } catch (error) {
    console.error('Join Team Error:', error);
    return NextResponse.json({ error: 'Failed to join team' }, { status: 500 });
  }
} 