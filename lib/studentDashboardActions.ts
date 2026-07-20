import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { AcademicResetError, resetStudentAcademicInfo } from './academicReset';
import { reserveSupervisorCapacity } from './supervisorCapacity';
import { withTransactionRetry } from './transactionUtils';
import User from '../models/User';
import Project from '../models/Project';

type ProgramBatchUpdateBody = {
  id?: unknown;
  program?: unknown;
  batch?: unknown;
};

export async function updateStudentProgramBatch(req: NextRequest, body: ProgramBatchUpdateBody) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token || token.role !== 'student' || String(token.id) !== String(body.id)) {
    return NextResponse.json({ error: 'Unauthorized Program/Batch update request.' }, { status: 401 });
  }

  try {
    const result = await resetStudentAcademicInfo({
      targetUserId: String(body.id || '').trim(),
      newProgram: String(body.program || '').trim().toUpperCase(),
      newBatch: String(body.batch || '').trim(),
      actor: 'student',
      enforceStudentCooldown: true,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof AcademicResetError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    console.error('Program/Batch Update Error:', error);
    return NextResponse.json({ error: 'Failed to update Program/Batch.' }, { status: 500 });
  }
}

type AssignSupervisorBody = {
  id?: unknown;
  supervisorId?: unknown;
};

export async function assignStudentSupervisor(req: NextRequest, body: AssignSupervisorBody) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token || token.role !== 'student' || String(token.id) !== String(body.id)) {
    return NextResponse.json({ error: 'Unauthorized supervisor assignment request.' }, { status: 401 });
  }

  if (
    !mongoose.Types.ObjectId.isValid(String(body.id || '')) ||
    !mongoose.Types.ObjectId.isValid(String(body.supervisorId || ''))
  ) {
    return NextResponse.json({ error: 'Invalid student or supervisor.' }, { status: 400 });
  }

  const session = await mongoose.startSession();

  try {
    return await withTransactionRetry(session, async () => {
      const triggeringStudent = await User.findById(body.id).session(session);
      if (!triggeringStudent) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }

      if (triggeringStudent.supervisorId && triggeringStudent.status !== 'Unassigned') {
        return NextResponse.json(
          { error: 'You already have a supervisor. Use the change supervisor option instead.' },
          { status: 400 }
        );
      }

      const capacity = await reserveSupervisorCapacity(String(body.supervisorId), session);

      if (capacity.kind === 'missing') {
        return NextResponse.json({ error: 'Selected supervisor was not found.' }, { status: 404 });
      }

      if (capacity.kind === 'full') {
        return NextResponse.json(
          { error: `Cannot assign. The selected supervisor has reached maximum capacity (${capacity.maxSlots} slots).` },
          { status: 409 }
        );
      }

      const supervisorId = new mongoose.Types.ObjectId(String(body.supervisorId));

      if (triggeringStudent.projectId) {
        await Project.findByIdAndUpdate(
          triggeringStudent.projectId,
          { $set: { supervisorId } },
          { session }
        );
        await User.updateMany(
          { projectId: triggeringStudent.projectId },
          { $set: { supervisorId, status: 'Pending', remarks: '' } },
          { session }
        );
      } else {
        await User.findByIdAndUpdate(
          body.id,
          { $set: { supervisorId, status: 'Pending', remarks: '' } },
          { session }
        );
      }

      return NextResponse.json({ message: 'Supervisor successfully assigned to your team!' }, { status: 200 });
    });
  } finally {
    session.endSession();
  }
}
