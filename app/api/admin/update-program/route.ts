import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { targetUserId, newProgram } = await req.json();

    // Start Atomic Transaction Session to prevent ghost data during the reset
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const student = await User.findById(targetUserId).session(session);
      if (!student) {
        await session.abortTransaction();
        session.endSession();
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }

      // 1. Ghost Data Purge: Eject from current team safely within the transaction
      if (student.projectId) {
        const oldProject = await Project.findById(student.projectId).session(session);
        if (oldProject) {
          // If they are the only member, delete the project entirely
          if (oldProject.members.length === 1 && oldProject.members[0].toString() === targetUserId) {
            await Project.findByIdAndDelete(student.projectId, { session });
          } else {
            // Otherwise, just remove them from the array atomically
            await Project.findByIdAndUpdate(student.projectId, {
              $pull: { members: targetUserId }
            }, { session });
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
      await newProject.save({ session });

      // 3. Apply the hard reset to the User document
      student.program = newProgram;
      student.supervisorId = null;
      student.projectId = newProject._id;
      student.status = 'Unassigned';
      student.projectTitle = '';
      student.pdfUrl = '';
      student.remarks = 'Your program was updated by an Admin. You have been unassigned from your team and supervisor.';
      await student.save({ session });

      // 4. Commit the transaction securely
      await session.commitTransaction();
      session.endSession();

      return NextResponse.json({ message: 'Program updated and student reset successfully!' }, { status: 200 });

    } catch (transactionError) {
      // Emergency Rollback: Revert all changes if any step fails
      await session.abortTransaction();
      session.endSession();
      throw transactionError; 
    }

  } catch (error) {
    console.error('Update Program Error:', error);
    return NextResponse.json({ error: 'Failed to update program' }, { status: 500 });
  }
}