import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';

export async function POST(req: Request) {
  try {
    const { studentId, inviteCode } = await req.json();
    await connectToDatabase();

    // 1. Find the target project
    const targetProject = await Project.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (!targetProject) {
      return NextResponse.json({ error: 'Invalid Invite Code! Please check the code and try again.' }, { status: 404 });
    }

    // 2. Limit and Redundancy Checks
    if (targetProject.members.length >= 2) {
      return NextResponse.json({ error: 'This team is already full (Max 2 members).' }, { status: 400 });
    }
    if (targetProject.members.includes(studentId)) {
      return NextResponse.json({ error: 'You are already in this team.' }, { status: 400 });
    }

    const student = await User.findById(studentId);
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    // 3. Program Matching & Fetching Teammate State
    let firstMember = null;
    if (targetProject.members.length > 0) {
      firstMember = await User.findById(targetProject.members[0]);
      if (firstMember && firstMember.program !== student.program) {
        return NextResponse.json({ 
          error: `Program Mismatch! You are in ${student.program}, but this team belongs to ${firstMember.program} students.` 
        }, { status: 403 });
      }
    }

    // 4. Ghost Data Purge
    if (student.projectId) {
      const oldProject = await Project.findById(student.projectId);
      if (oldProject && oldProject.members.length === 1 && oldProject.members[0].toString() === studentId) {
        await Project.findByIdAndDelete(student.projectId);
      }
    }

    // 5. Add to project array
    targetProject.members.push(studentId);
    await targetProject.save();

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