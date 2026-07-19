// app/api/project/join/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import mongoose from 'mongoose';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import { withTransactionRetry } from '../../../../lib/transactionUtils';
import { APP_SETTINGS } from '../../../../config/appSettings';
import { getSupervisorMaxSlots } from '../../../../lib/supervisorSlots';
import { getSupervisorFilledSlots } from '../../../../lib/supervisorCapacity';
import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../../../../config/projectDomains';

const MAX_TEAM_MEMBERS = 2;

export async function POST(req: NextRequest) {
  try {
    const { studentId, inviteCode } = await req.json();

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (token.role !== 'student' && token.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (token.role === 'student' && String(token.id) !== String(studentId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

        // 2. Fixed two-student limit and redundancy checks.
        // Existing three-member teams are preserved, but no future join may create or restore one.
        if (targetProject.members.length >= MAX_TEAM_MEMBERS) {
          return NextResponse.json(
            {
              error: `This team is already full (maximum ${MAX_TEAM_MEMBERS} students).`,
              code: 'TEAM_FULL',
            },
            { status: 409 }
          );
        }

        if (targetProject.members.some((memberId: any) => String(memberId) === String(studentId))) {
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
              // Only block the join if we are counting by individual STUDENTS.
              // If we are counting by PROJECT, this project already exists and is already counted.
              // Adding a member to an existing project does not consume an extra project slot.
              if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'STUDENT') {
                const supervisor = await User.findOne({ _id: firstMember.supervisorId, role: 'supervisor' })
                  .select('_id extraSlots')
                  .session(session);

                const currentFilledSlots = await getSupervisorFilledSlots(
                  String(firstMember.supervisorId),
                  session
                );
                const maxSlots = getSupervisorMaxSlots(supervisor);
                
                if (currentFilledSlots >= maxSlots) {
                  return NextResponse.json({ 
                    error: `Capacity Firewall: The supervisor assigned to this team has reached their absolute student limit (${maxSlots} slots).` 
                  }, { status: 409 });
                }
              }
            }
          }
        }

        const inheritedDomainIds = normalizeProjectDomainIds(
          Array.isArray((targetProject as any).domains) && (targetProject as any).domains.length > 0
            ? (targetProject as any).domains
            : (firstMember as any)?.domains,
          targetProject.domain || (firstMember as any)?.domain
        );
        const inheritedDomainText = formatProjectDomainLabels(
          inheritedDomainIds,
          targetProject.domain || (firstMember as any)?.domain
        );

        // 4. Guard the final write as well as the read-time check.
        // The transaction retry wrapper will re-run this flow after a concurrent write conflict.
        const joinedProject = await Project.findOneAndUpdate(
          {
            _id: targetProject._id,
            members: { $ne: studentId },
            'members.1': { $exists: false },
          },
          {
            $addToSet: { members: studentId },
            $set: {
              domains: inheritedDomainIds,
              domain: inheritedDomainText,
            },
          },
          { new: true, session }
        );

        if (!joinedProject) {
          return NextResponse.json(
            {
              error: `This team is already full (maximum ${MAX_TEAM_MEMBERS} students).`,
              code: 'TEAM_FULL',
            },
            { status: 409 }
          );
        }

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
        student.projectId = joinedProject._id;
        
        if (firstMember) {
          student.supervisorId = firstMember.supervisorId;
          student.status = firstMember.status;
          student.remarks = firstMember.remarks;
          student.projectTitle = firstMember.projectTitle;
          student.projectDesc = firstMember.projectDesc;
          student.domain = inheritedDomainText;
          student.domains = inheritedDomainIds;
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
