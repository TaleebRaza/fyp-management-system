import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';

export async function POST(req: Request) {
  try {
    const { studentId, inviteCode } = await req.json();
    await connectToDatabase();

    // 1. Find the target project using the provided invite code
    const targetProject = await Project.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (!targetProject) {
      return NextResponse.json({ error: 'Invalid Invite Code! Please check the code and try again.' }, { status: 404 });
    }

    // 2. Enforce Group Limits & Redundancy Checks
    if (targetProject.members.length >= 2) {
      return NextResponse.json({ error: 'This team is already full (Max 2 members).' }, { status: 400 });
    }
    if (targetProject.members.includes(studentId)) {
      return NextResponse.json({ error: 'You are already in this team.' }, { status: 400 });
    }

    const student = await User.findById(studentId);
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    // 3. Ghost Data Purge: Delete the student's old default project
    if (student.projectId) {
      const oldProject = await Project.findById(student.projectId);
      // Safety check: Only delete if they are the sole member of that project
      if (oldProject && oldProject.members.length === 1 && oldProject.members[0].toString() === studentId) {
        await Project.findByIdAndDelete(student.projectId);
      }
    }

    // 4. Add student to the new project and inherit supervisor
    targetProject.members.push(studentId);
    await targetProject.save();

    student.projectId = targetProject._id;
    student.supervisorId = targetProject.supervisorId; 
    await student.save();

    return NextResponse.json({ message: 'Successfully joined the team!' }, { status: 200 });

  } catch (error) {
    console.error('Join Team Error:', error);
    return NextResponse.json({ error: 'Failed to join team' }, { status: 500 });
  }
}