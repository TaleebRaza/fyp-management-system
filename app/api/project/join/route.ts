import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';

export async function POST(req: Request) {
  try {
    const { studentId, inviteCode } = await req.json();
    await connectToDatabase();

    const student = await User.findById(studentId);
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    // 1. Find the target project (The "Read" phase)
    const targetProject = await Project.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (!targetProject) {
      return NextResponse.json({ error: 'Invalid Invite Code! Please check the code and try again.' }, { status: 404 });
    }

    // 2. Limit and Redundancy Checks in memory
    if (targetProject.members.length >= 2) {
      return NextResponse.json({ error: 'This team is already full (Max 2 members).' }, { status: 400 });
    }
    if (targetProject.members.includes(studentId)) {
      return NextResponse.json({ error: 'You are already in this team.' }, { status: 400 });
    }

    // 3. Program & Batch Matching & Fetching Teammate State
    let firstMember = null;
    if (targetProject.members.length > 0) {
      firstMember = await User.findById(targetProject.members[0]);
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
      }
    }

    // 4. ATOMIC UPDATE (Optimistic Concurrency Control)
    // We attempt to update the database ONLY if the members array hasn't changed since we checked it.
    const atomicUpdate = await Project.findOneAndUpdate(
      { 
        _id: targetProject._id, 
        members: targetProject.members // The "Lock": Ensures no one else joined in the last millisecond
      },
      { 
        $addToSet: { members: studentId } // Atomically pushes only if student isn't already there
      },
      { new: true }
    );

    // If atomicUpdate is null, it means the members array changed mid-flight. A race condition was caught!
    if (!atomicUpdate) {
      return NextResponse.json({ error: 'Team state changed during join. The team might be full now. Please try again.' }, { status: 409 });
    }

    // 5. Ghost Data Purge (Optimized with atomic operations)
    if (student.projectId && student.projectId.toString() !== targetProject._id.toString()) {
      const oldProject = await Project.findById(student.projectId);
      if (oldProject) {
        if (oldProject.members.length === 1 && oldProject.members[0].toString() === studentId) {
          // If they were the only member, destroy the old project
          await Project.findByIdAndDelete(student.projectId);
        } else {
          // Atomically remove them from the old team's array
          await Project.findByIdAndUpdate(student.projectId, {
            $pull: { members: studentId }
          });
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
      // Fallback just in case the project was empty
      student.supervisorId = targetProject.supervisorId;
    }

    await student.save();

    return NextResponse.json({ message: 'Successfully joined the team!' }, { status: 200 });

  } catch (error) {
    console.error('Join Team Error:', error);
    return NextResponse.json({ error: 'Failed to join team' }, { status: 500 });
  }
}