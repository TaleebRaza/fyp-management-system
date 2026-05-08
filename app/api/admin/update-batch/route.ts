import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { targetUserId, newBatch } = await req.json();

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const student = await User.findById(targetUserId).session(session);
      if (!student) {
        await session.abortTransaction();
        session.endSession();
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }

      // Ghost Data Purge: Eject from current team safely within the transaction
      if (student.projectId) {
        const oldProject = await Project.findById(student.projectId).session(session);
        if (oldProject) {
          if (oldProject.members.length === 1 && oldProject.members[0].toString() === targetUserId) {
            await Project.findByIdAndDelete(student.projectId, { session });
          } else {
            await Project.findByIdAndUpdate(student.projectId, {
              $pull: { members: targetUserId }
            }, { session });
          }
        }
      }

      // Generate a new, empty default project for this student
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const newProject = new Project({
        supervisorId: null,
        members: [student._id],
        inviteCode: inviteCode
      });
      await newProject.save({ session });

      // Apply the hard reset
      student.batch = newBatch;
      student.supervisorId = null;
      student.projectId = newProject._id;
      student.status = 'Unassigned';
      student.projectTitle = '';
      student.pdfUrl = '';
      student.remarks = 'Your batch was updated by an Admin. You have been unassigned from your team.';
      await student.save({ session });

      await session.commitTransaction();
      session.endSession();

      return NextResponse.json({ message: 'Batch updated and student reset successfully!' }, { status: 200 });

    } catch (transactionError) {
      await session.abortTransaction();
      session.endSession();
      throw transactionError; 
    }
  } catch (error) {
    console.error('Update Batch Error:', error);
    return NextResponse.json({ error: 'Failed to update batch' }, { status: 500 });
  }
}