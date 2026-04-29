import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { targetUserId, newProgram } = await req.json();

    const student = await User.findById(targetUserId);
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    // 1. Ghost Data Purge: Eject from current team
    if (student.projectId) {
      const oldProject = await Project.findById(student.projectId);
      if (oldProject) {
        // If they are the only member, delete the project entirely
        if (oldProject.members.length === 1 && oldProject.members[0].toString() === targetUserId) {
          await Project.findByIdAndDelete(student.projectId);
        } else {
          // Otherwise, just remove them from the array
          await Project.findByIdAndUpdate(student.projectId, {
            $pull: { members: targetUserId }
          });
        }
      }
    }

    // 2. Generate a new, empty default project for this student
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newProject = new Project({
      supervisorId: null,
      members: [student._id],
      inviteCode: inviteCode
    });
    await newProject.save();

    // 3. Apply the hard reset
    student.program = newProgram;
    student.supervisorId = null;
    student.projectId = newProject._id;
    student.status = 'Unassigned';
    student.projectTitle = '';
    student.pdfUrl = '';
    student.remarks = 'Your program was updated by an Admin. You have been unassigned from your team and supervisor.';
    await student.save();

    return NextResponse.json({ message: 'Program updated and student reset successfully!' }, { status: 200 });
  } catch (error) {
    console.error('Update Program Error:', error);
    return NextResponse.json({ error: 'Failed to update program' }, { status: 500 });
  }
}