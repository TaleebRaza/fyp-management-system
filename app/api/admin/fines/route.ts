import mongoose from 'mongoose';
import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import RegistrationPolicy from '../../../../models/RegistrationPolicy';
import {
  REGISTRATION_POLICY_KEY,
  getOrCreateRegistrationPolicy,
  serializeRegistrationPolicy,
} from '../../../../lib/registrationPolicy';
import { buildFineRestriction } from '../../../../lib/fineRestriction';
import { calculateLateRegistrationFine } from '../../../../lib/lateRegistrationFine';

export const dynamic = 'force-dynamic';

const normalizeText = (value: unknown, maximumLength: number) =>
  String(value || '').trim().slice(0, maximumLength);

async function requireAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return token && token.role === 'admin' ? token : null;
}

async function buildResponsePayload() {
  const [policyDocument, studentDocuments] = await Promise.all([
    getOrCreateRegistrationPolicy(),
    User.find({
      role: 'student',
      $or: [
        {
          lateRegistrationFine: { $gt: 0 },
          lateRegistrationFineStatus: { $nin: ['resolved', 'waived'] },
        },
        {
          'registrationPunishment.active': true,
          'registrationPunishment.category': 'fine',
          'registrationPunishment.amount': { $gt: 0 },
          'registrationPunishment.status': { $nin: ['resolved', 'waived'] },
        },
      ],
    })
      .select(
        '_id name rollNo program batch status projectId lateRegistrationDays lateRegistrationFine lateRegistrationFineStatus registrationPunishment'
      )
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const policy = serializeRegistrationPolicy(policyDocument);
  const students = studentDocuments
    .map((student: any) => {
      const restriction = buildFineRestriction(student);
      if (!restriction) return null;
      return {
        id: String(student._id),
        name: student.name || 'Unnamed student',
        rollNo: student.rollNo || 'N/A',
        program: student.program || 'N/A',
        batch: student.batch || 'N/A',
        projectStatus: student.status || 'Pending',
        restriction,
      };
    })
    .filter(Boolean);

  return {
    students,
    finePayment: policy.finePayment,
    lateFineAccrual: policy.lateFineAccrual,
    currentLateFine: calculateLateRegistrationFine(new Date(), policy.lateFineAccrual),
  };
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
    }
    await connectToDatabase();
    return NextResponse.json(await buildResponsePayload(), {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Admin fines read error:', error);
    return NextResponse.json({ error: 'Unable to load fine management.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const token = await requireAdmin(req);
    if (!token) {
      return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
    }

    await connectToDatabase();
    const body = await req.json();
    const action = String(body?.action || '');
    const now = new Date();
    const updatedBy =
      typeof token.id === 'string' && mongoose.Types.ObjectId.isValid(token.id) ? token.id : null;

    if (action === 'updatePaymentDetails') {
      const finePayment = {
        methodLabel: normalizeText(body?.finePayment?.methodLabel, 100),
        accountTitle: normalizeText(body?.finePayment?.accountTitle, 120),
        accountNumber: normalizeText(body?.finePayment?.accountNumber, 120),
        instructions: normalizeText(body?.finePayment?.instructions, 1500),
      };
      await RegistrationPolicy.findOneAndUpdate(
        { policyKey: REGISTRATION_POLICY_KEY },
        {
          $set: { finePayment, updatedBy },
          $setOnInsert: { policyKey: REGISTRATION_POLICY_KEY },
          $inc: { version: 1 },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      return NextResponse.json({
        message: 'Fine payment details saved.',
        ...(await buildResponsePayload()),
      });
    }

    if (action === 'pauseAccrual') {
      const policy = serializeRegistrationPolicy(await getOrCreateRegistrationPolicy());
      if (!policy.lateFineAccrual.paused) {
        const current = calculateLateRegistrationFine(new Date(), policy.lateFineAccrual);
        await RegistrationPolicy.findOneAndUpdate(
          { policyKey: REGISTRATION_POLICY_KEY },
          {
            $set: {
              'lateFineAccrual.paused': true,
              'lateFineAccrual.frozenDays': current.daysLate,
              'lateFineAccrual.frozenAmount': current.fineAmount,
              'lateFineAccrual.pausedAt': now,
              'lateFineAccrual.resumedAt': null,
              updatedBy,
            },
            $inc: { version: 1 },
          }
        );
      }
      return NextResponse.json({
        message: 'Late-registration fine compounding is paused.',
        ...(await buildResponsePayload()),
      });
    }

    if (action === 'resumeAccrual') {
      const policy = serializeRegistrationPolicy(await getOrCreateRegistrationPolicy());
      if (policy.lateFineAccrual.paused) {
        await RegistrationPolicy.findOneAndUpdate(
          { policyKey: REGISTRATION_POLICY_KEY },
          {
            $set: {
              'lateFineAccrual.paused': false,
              'lateFineAccrual.resumedAt': now,
              updatedBy,
            },
            $inc: { version: 1 },
          }
        );
      }
      return NextResponse.json({
        message: 'Late-registration fine compounding has resumed from the frozen amount.',
        ...(await buildResponsePayload()),
      });
    }

    if (action === 'clearRestriction') {
      const studentId = String(body?.studentId || '').trim();
      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return NextResponse.json({ error: 'Invalid student account.' }, { status: 400 });
      }

      const student = await User.findOne({ _id: studentId, role: 'student' });
      if (!student) {
        return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
      }

      const currentRestriction = buildFineRestriction(student);
      const resolvedFields: Record<string, unknown> = {};
      if (currentRestriction?.lateRegistrationFine) {
        resolvedFields.lateRegistrationFineStatus = 'resolved';
        resolvedFields.lateRegistrationFineResolvedAt = now;
      }
      if (currentRestriction?.adminFine) {
        resolvedFields['registrationPunishment.status'] = 'resolved';
        resolvedFields['registrationPunishment.resolvedAt'] = now;
      }
      if (Object.keys(resolvedFields).length > 0) {
        await User.updateOne(
          { _id: student._id, role: 'student' },
          { $set: resolvedFields }
        );
      }

      return NextResponse.json({
        message: 'Payment verified and the student upload restriction was removed.',
        ...(await buildResponsePayload()),
      });
    }

    return NextResponse.json({ error: 'Unsupported fine-management action.' }, { status: 400 });
  } catch (error) {
    console.error('Admin fines update error:', error);
    return NextResponse.json({ error: 'Unable to update fine management.' }, { status: 500 });
  }
}
