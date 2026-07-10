import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import mongoose from 'mongoose';
import connectToDatabase from '../../../../../lib/mongodb';
import PendingVerification from '../../../../../models/PendingVerification';
import User from '../../../../../models/User';
import Project from '../../../../../models/Project';
import { APP_SETTINGS } from '../../../../../config/appSettings';
import { buildRollNoRegex } from '../../../../../lib/rollNo';
import { getSupervisorMaxSlots } from '../../../../../lib/supervisorSlots';

async function getFilledSlots(supervisorId: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
  if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'STUDENT') {
    return User.countDocuments({ role: 'student', supervisorId }).session(session);
  }

  return Project.countDocuments({ supervisorId }).session(session);
}

async function createProjectForStudent(
  studentId: mongoose.Types.ObjectId,
  supervisorId: mongoose.Types.ObjectId | null,
  session: mongoose.ClientSession
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const project = new Project({
        supervisorId,
        members: [studentId],
        inviteCode,
        stage: 'PROPOSAL',
        status: 'Pending',
        pdfUrl: '',
        pdfSize: 0,
      });

      await project.save({ session });
      return project;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
  }

  throw new Error('Failed to generate a unique project invite code.');
}

export async function POST(req: NextRequest) {
  const session = await mongoose.startSession();

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token || token.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
    }

    const { requestId } = await req.json();

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return NextResponse.json({ error: 'Invalid verification request.' }, { status: 400 });
    }

    await connectToDatabase();

    session.startTransaction();

    const pendingRequest = await PendingVerification.findById(requestId).session(session);

    if (!pendingRequest || !['pending', 'action_required'].includes(pendingRequest.status)) {
      await session.abortTransaction();
      return NextResponse.json({ error: 'Pending verification request was not found.' }, { status: 404 });
    }

    const existingUser = await User.findOne({
      $or: [
        { email: pendingRequest.email },
        { rollNo: pendingRequest.rollNo },
        { rollNo: buildRollNoRegex(pendingRequest.rollNo) },
      ],
    }).session(session);

    if (existingUser) {
      pendingRequest.status = 'rejected';
      pendingRequest.rejectedBy = new mongoose.Types.ObjectId(String(token.id));
      pendingRequest.rejectedAt = new Date();
      pendingRequest.rejectionReason = 'A registered account already exists for this email or roll number.';
      await pendingRequest.save({ session });
      await session.commitTransaction();

      return NextResponse.json(
        { error: 'A registered account already exists for this email or roll number.' },
        { status: 409 }
      );
    }

    let finalSupervisorId: mongoose.Types.ObjectId | null = null;

    if (pendingRequest.supervisorId) {
      const supervisor = await User.findOne({ _id: pendingRequest.supervisorId, role: 'supervisor' })
        .select('_id extraSlots')
        .session(session)
        .lean();

      if (!supervisor) {
        await session.abortTransaction();
        return NextResponse.json({ error: 'Selected supervisor no longer exists.' }, { status: 404 });
      }

      const filledSlots = await getFilledSlots(pendingRequest.supervisorId, session);
      const maxSlots = getSupervisorMaxSlots(supervisor);

      if (filledSlots >= maxSlots) {
        await session.abortTransaction();
        return NextResponse.json(
          { error: `Selected supervisor has reached maximum capacity (${maxSlots} slots). Edit the pending request or ask the student to choose later.` },
          { status: 409 }
        );
      }

      finalSupervisorId = pendingRequest.supervisorId;
    }

    const newStudent = new User({
      name: pendingRequest.name,
      email: pendingRequest.email,
      rollNo: pendingRequest.rollNo,
      password: pendingRequest.passwordHash,
      role: 'student',
      program: pendingRequest.program,
      batch: pendingRequest.batch,
      semester: '7th Semester',
      supervisorId: finalSupervisorId,
      status: finalSupervisorId ? 'Pending' : 'Unassigned',
      remarks: finalSupervisorId ? '' : 'Manual verification approved. Choose a supervisor or join a team to begin.',
    });

    await newStudent.save({ session });

    const newProject = await createProjectForStudent(newStudent._id, finalSupervisorId, session);
    newStudent.projectId = newProject._id;
    await newStudent.save({ session });

    pendingRequest.status = 'approved';
    pendingRequest.approvedBy = new mongoose.Types.ObjectId(String(token.id));
    pendingRequest.approvedAt = new Date();
    pendingRequest.adminRemark = 'Manual verification approved. Account created.';
    await pendingRequest.save({ session });

    await session.commitTransaction();

    return NextResponse.json(
      { message: `${pendingRequest.name}'s account has been created and verified.` },
      { status: 201 }
    );
  } catch (error: any) {
    await session.abortTransaction().catch(() => undefined);

    if (error?.code === 11000) {
      return NextResponse.json(
        { error: 'This Roll Number or Email is already registered.' },
        { status: 400 }
      );
    }

    console.error('Approve Pending Verification Error:', error.message);
    return NextResponse.json({ error: 'Failed to approve verification request.' }, { status: 500 });
  } finally {
    session.endSession();
  }
}
