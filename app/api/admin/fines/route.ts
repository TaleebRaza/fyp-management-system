import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import RegistrationPolicy from '../../../../models/RegistrationPolicy';
import {
  REGISTRATION_POLICY_KEY,
  getOrCreateRegistrationPolicy,
  serializeRegistrationPolicy,
} from '../../../../lib/registrationPolicy';
import {
  buildFineRestriction,
  OUTSTANDING_STUDENT_FINE_FILTER,
  type FineRestrictedUser,
} from '../../../../lib/fineRestriction';
import { calculateLateRegistrationFine } from '../../../../lib/lateRegistrationFine';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { FINE_RESTRICTION_DEFINITIONS } from '../../../../types/registrationPolicy';
import {
  invalidatePublicContent,
  PUBLIC_REGISTRATION_POLICY_TAG,
} from '../../../../lib/publicContentCache';

export const dynamic = 'force-dynamic';

const STUDENT_LIMIT = 20;

const normalizeText = (value: unknown, maximumLength: number) =>
  String(value || '').trim().slice(0, maximumLength);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function requireAdmin(req: NextRequest) {
  return requireCurrentUser(req, ['admin']);
}

type RestrictedStudentRecord = FineRestrictedUser & {
  _id?: unknown;
  name?: string;
  rollNo?: string;
  program?: string;
  batch?: string;
  status?: string;
};

const serializeStudent = (student: RestrictedStudentRecord) => {
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
};

async function findRestrictedStudents(searchTerm = '') {
  const escapedSearch = searchTerm ? escapeRegExp(searchTerm) : '';
  const studentFilter = searchTerm
    ? {
        $and: [
          OUTSTANDING_STUDENT_FINE_FILTER,
          {
            $or: [
              { rollNo: { $regex: `^${escapedSearch}$`, $options: 'i' } },
              { name: { $regex: escapedSearch, $options: 'i' } },
            ],
          },
        ],
      }
    : OUTSTANDING_STUDENT_FINE_FILTER;

  const studentDocuments = await User.find(studentFilter)
    .select(
      '_id name rollNo program batch status projectId lateRegistrationDays lateRegistrationFine lateRegistrationFineStatus registrationPunishment'
    )
    .sort({ createdAt: -1 })
    .limit(STUDENT_LIMIT)
    .lean();

  return studentDocuments.map(serializeStudent).filter(Boolean);
}

async function buildInitialResponsePayload() {
  const [policyDocument, students] = await Promise.all([
    getOrCreateRegistrationPolicy(),
    findRestrictedStudents(),
  ]);

  const policy = serializeRegistrationPolicy(policyDocument);
  return {
    students,
    search: '',
    limit: STUDENT_LIMIT,
    finePayment: policy.finePayment,
    lateFineAccrual: policy.lateFineAccrual,
    fineRestrictions: policy.fineRestrictions,
    currentLateFine: calculateLateRegistrationFine(new Date(), policy.lateFineAccrual),
  };
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
    }

    const searchTerm = normalizeText(req.nextUrl.searchParams.get('q'), 80);
    if (searchTerm && searchTerm.length < 2) {
      return NextResponse.json(
        { error: 'Enter at least two characters to search for a student.' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const payload = searchTerm
      ? {
          students: await findRestrictedStudents(searchTerm),
          search: searchTerm,
          limit: STUDENT_LIMIT,
        }
      : await buildInitialResponsePayload();

    return NextResponse.json(payload, {
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
      const updatedPolicyDocument = await RegistrationPolicy.findOneAndUpdate(
        { policyKey: REGISTRATION_POLICY_KEY },
        {
          $set: { finePayment, updatedBy },
          $setOnInsert: { policyKey: REGISTRATION_POLICY_KEY },
          $inc: { version: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      const updatedPolicy = serializeRegistrationPolicy(updatedPolicyDocument);
      invalidatePublicContent(PUBLIC_REGISTRATION_POLICY_TAG);

      return NextResponse.json({
        message: 'Fine payment details saved.',
        finePayment: updatedPolicy.finePayment,
      });
    }

    if (action === 'pauseAccrual') {
      const policyDocument = await getOrCreateRegistrationPolicy();
      const policy = serializeRegistrationPolicy(policyDocument);
      let updatedPolicy = policy;

      if (!policy.lateFineAccrual.paused) {
        const current = calculateLateRegistrationFine(now, policy.lateFineAccrual);
        const updatedPolicyDocument = await RegistrationPolicy.findOneAndUpdate(
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
          },
          { new: true }
        );
        updatedPolicy = serializeRegistrationPolicy(updatedPolicyDocument || policyDocument);
      }
      invalidatePublicContent(PUBLIC_REGISTRATION_POLICY_TAG);

      return NextResponse.json({
        message: 'Late-registration fine compounding is paused.',
        lateFineAccrual: updatedPolicy.lateFineAccrual,
        currentLateFine: calculateLateRegistrationFine(now, updatedPolicy.lateFineAccrual),
      });
    }

    if (action === 'resumeAccrual') {
      const policyDocument = await getOrCreateRegistrationPolicy();
      const policy = serializeRegistrationPolicy(policyDocument);
      let updatedPolicy = policy;

      if (policy.lateFineAccrual.paused) {
        const updatedPolicyDocument = await RegistrationPolicy.findOneAndUpdate(
          { policyKey: REGISTRATION_POLICY_KEY },
          {
            $set: {
              'lateFineAccrual.paused': false,
              'lateFineAccrual.resumedAt': now,
              updatedBy,
            },
            $inc: { version: 1 },
          },
          { new: true }
        );
        updatedPolicy = serializeRegistrationPolicy(updatedPolicyDocument || policyDocument);
      }
      invalidatePublicContent(PUBLIC_REGISTRATION_POLICY_TAG);

      return NextResponse.json({
        message: 'Late-registration fine compounding has resumed from the frozen amount.',
        lateFineAccrual: updatedPolicy.lateFineAccrual,
        currentLateFine: calculateLateRegistrationFine(now, updatedPolicy.lateFineAccrual),
      });
    }

    if (action === 'setFineRestriction') {
      const restrictionKey = String(body?.restrictionKey || '');
      const restriction = FINE_RESTRICTION_DEFINITIONS.find(
        (definition) => definition.key === restrictionKey
      );
      if (!restriction || typeof body?.enabled !== 'boolean') {
        return NextResponse.json({ error: 'Invalid fine restriction.' }, { status: 400 });
      }

      const updatedPolicyDocument = await RegistrationPolicy.findOneAndUpdate(
        { policyKey: REGISTRATION_POLICY_KEY },
        {
          $set: {
            [`fineRestrictions.${restriction.key}`]: body.enabled,
            updatedBy,
          },
          $setOnInsert: { policyKey: REGISTRATION_POLICY_KEY },
          $inc: { version: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      const updatedPolicy = serializeRegistrationPolicy(updatedPolicyDocument);
      invalidatePublicContent(PUBLIC_REGISTRATION_POLICY_TAG);

      return NextResponse.json({
        message: body.enabled
          ? `${restriction.name} is restricted for teams with outstanding fines.`
          : `${restriction.name} is allowed while fines remain outstanding.`,
        fineRestrictions: updatedPolicy.fineRestrictions,
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
      let updatedStudent = student;
      if (Object.keys(resolvedFields).length > 0) {
        const savedStudent = await User.findOneAndUpdate(
          { _id: student._id, role: 'student' },
          { $set: resolvedFields },
          { new: true }
        ).select(
          'lateRegistrationDays lateRegistrationFine lateRegistrationFineStatus lateRegistrationFineResolvedAt registrationPunishment'
        );

        if (!savedStudent) {
          return NextResponse.json(
            { error: 'The student fine record could not be updated.' },
            { status: 409 }
          );
        }
        updatedStudent = savedStudent;
      }

      if (buildFineRestriction(updatedStudent)) {
        return NextResponse.json(
          {
            error:
              'The payment was not marked as resolved. Refresh the student record and try again.',
          },
          { status: 409 }
        );
      }

      return NextResponse.json({
        message: 'Payment verified and the student upload restriction was removed.',
        studentId,
        clearedAmount: currentRestriction?.totalAmount || 0,
      });
    }

    return NextResponse.json({ error: 'Unsupported fine-management action.' }, { status: 400 });
  } catch (error) {
    console.error('Admin fines update error:', error);
    return NextResponse.json({ error: 'Unable to update fine management.' }, { status: 500 });
  }
}
