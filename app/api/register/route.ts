import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import Project from '../../../models/Project';
import RollNumberClaim from '../../../models/RollNumberClaim';
import {
  buildRollNoRegex,
  isValidRollNo,
  normalizeRollNo,
} from '../../../lib/rollNo';
import { isValidEmailAddress, normalizeEmailAddress } from '../../../lib/studentIdentity';
import { PROGRAM_MAP } from '../../../config/appSettings';
import { calculateLateRegistrationFine } from '../../../lib/lateRegistrationFine';
import RegistrationPolicy from '../../../models/RegistrationPolicy';
import {
  REGISTRATION_POLICY_KEY,
  buildRegistrationPunishmentSnapshot,
  getOrCreateRegistrationPolicy,
  serializeRegistrationPolicy,
} from '../../../lib/registrationPolicy';
import { validatePassword } from '../../../lib/security/password';
import { createInviteCode } from '../../../lib/security/inviteCode';
import { normalizeText } from '../../../lib/security/input';
import { consumeRateLimitDimensions } from '../../../lib/rateLimit';
import {
  capacityReservationError,
  reserveSupervisorProjectSlot,
} from '../../../lib/supervisorCapacity';
import { recordPortalActivity } from '../../../lib/portalActivityLog';

export async function POST(req: NextRequest) {
  try {
    const { name, email, rollNo, password, supervisorId, program, batch } = await req.json();
    const normalizedName = normalizeText(name, 100);
    const normalizedEmail = normalizeEmailAddress(email);
    const normalizedRollNo = normalizeRollNo(rollNo);
    const normalizedPassword = String(password || '');
    const normalizedProgram = String(program || 'BSCS').trim().toUpperCase();
    const normalizedBatch = normalizeText(batch, 20);

    if (!normalizedName || !normalizedEmail || !normalizedRollNo || !normalizedPassword || !normalizedBatch) {
      return NextResponse.json(
        { error: 'Name, email, roll number, password, and batch are required.' },
        { status: 400 }
      );
    }

    if (normalizedEmail.length > 254 || !isValidEmailAddress(normalizedEmail)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    if (!isValidRollNo(normalizedRollNo)) {
      return NextResponse.json(
        { error: 'Roll number must match F/S followed by two digits, a hyphen, and four digits (for example, F23-0201).' },
        { status: 400 }
      );
    }

    if (!validatePassword(normalizedPassword)) {
      return NextResponse.json({ error: 'Password must be 10 to 128 characters.' }, { status: 400 });
    }

    if (!Object.prototype.hasOwnProperty.call(PROGRAM_MAP, normalizedProgram)) {
      return NextResponse.json({ error: 'Invalid program selected.' }, { status: 400 });
    }

    await connectToDatabase();
    const rateLimit = await consumeRateLimitDimensions(
      'registration',
      `${normalizedRollNo}:${normalizedEmail}`,
      req.headers,
      5
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again in an hour.' },
        { status: 429 }
      );
    }

    // The client-side lock is only informational. This server check is authoritative.
    const currentPolicyDocument = await getOrCreateRegistrationPolicy();
    const currentPolicy = serializeRegistrationPolicy(currentPolicyDocument);
    if (!currentPolicy.isOpen) {
      return NextResponse.json(
        {
          code: 'REGISTRATION_CLOSED',
          error: currentPolicy.closedMessage,
          policy: currentPolicy,
        },
        { status: 403 }
      );
    }

    // Keep all legacy user records untouched, but treat every existing roll number as taken.
    // The claim collection also preserves roll numbers claimed by registrations made after
    // this change, even if the corresponding user account is later removed.
    const [existingEmailUser, existingRollUser, existingRollNumberClaim] = await Promise.all([
      User.findOne({ email: normalizedEmail }).select('_id').lean(),
      User.findOne({
        $or: [
          { rollNo: normalizedRollNo },
          { rollNo: buildRollNoRegex(normalizedRollNo) },
        ],
      }).select('_id').lean(),
      RollNumberClaim.exists({ _id: normalizedRollNo }),
    ]);

    if (existingRollUser || existingRollNumberClaim) {
      return NextResponse.json(
        { error: 'This roll number is already registered.' },
        { status: 409 }
      );
    }

    if (existingEmailUser) {
      return NextResponse.json(
        { error: 'This email address is already registered.' },
        { status: 409 }
      );
    }

    if (supervisorId && !mongoose.Types.ObjectId.isValid(supervisorId)) {
      return NextResponse.json({ error: 'Invalid supervisor selected.' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // Atomically claim permission to register inside the same transaction.
      // Closing registration concurrently updates this document and prevents a stale form from succeeding.
      const transactionPolicyDocument = await RegistrationPolicy.findOneAndUpdate(
        { policyKey: REGISTRATION_POLICY_KEY, isOpen: true },
        { $inc: { registrationsAccepted: 1 } },
        { new: true, session }
      );

      if (!transactionPolicyDocument) {
        const closedError = Object.assign(new Error('Registration is currently closed.'), {
          code: 'REGISTRATION_CLOSED',
        });
        throw closedError;
      }

      const transactionPolicy = serializeRegistrationPolicy(transactionPolicyDocument);
      const lateRegistrationAssessment = calculateLateRegistrationFine(
        new Date(),
        transactionPolicy.lateFineAccrual
      );
      const registrationPunishment = buildRegistrationPunishmentSnapshot(transactionPolicy);

      if (supervisorId) {
        const reservation = await reserveSupervisorProjectSlot(supervisorId, session);
        if (reservation !== 'reserved') {
          throw Object.assign(new Error(capacityReservationError(reservation)), {
            code: `CAPACITY_${reservation.toUpperCase()}`,
          });
        }
      }

      const newStudent = new User({
        name: normalizedName,
        email: normalizedEmail,
        rollNo: normalizedRollNo,
        password: hashedPassword,
        role: 'student',
        program: normalizedProgram,
        batch: normalizedBatch,
        semester: '7th Semester',
        supervisorId: supervisorId || null,
        status: supervisorId ? 'Pending' : 'Unassigned',
        remarks: '',
        lateRegistrationDays: lateRegistrationAssessment.daysLate,
        lateRegistrationFine: lateRegistrationAssessment.fineAmount,
        registrationPunishment,
      });

      // _id is always unique, so this is the database-level guarantee that two
      // simultaneous requests cannot register the same normalized roll number.
      await RollNumberClaim.create(
        [{ _id: normalizedRollNo, studentId: newStudent._id }],
        { session }
      );

      await newStudent.save({ session });

      const newProject = new Project({
        supervisorId: supervisorId || null,
        members: [newStudent._id],
        inviteCode: createInviteCode(),
      });
      await newProject.save({ session });

      newStudent.projectId = newProject._id;
      await newStudent.save({ session });
      await session.commitTransaction();

      await recordPortalActivity({
        action: 'student-registered',
        actorId: newStudent._id.toString(),
        actorRole: 'student',
        actorName: newStudent.name,
        actorRollNo: newStudent.rollNo,
      });

      const punishmentMessage = registrationPunishment.active
        ? registrationPunishment.category === 'fine'
          ? ` An admin fine of PKR ${registrationPunishment.amount.toLocaleString()} has been attached to this registration.`
          : ` The following admin requirement has been attached: ${registrationPunishment.title}.`
        : '';

      return NextResponse.json(
        {
          message: `Registration successful! You can now sign in.${punishmentMessage}`,
          punishment: registrationPunishment.active ? registrationPunishment : null,
        },
        { status: 201 }
      );
    } catch (transactionError) {
      if (session.inTransaction()) await session.abortTransaction();

      const errorCode = (transactionError as { code?: unknown }).code;
      if (errorCode === 'REGISTRATION_CLOSED') {
        const latestPolicy = serializeRegistrationPolicy(await getOrCreateRegistrationPolicy());
        return NextResponse.json(
          {
            code: 'REGISTRATION_CLOSED',
            error: latestPolicy.closedMessage,
            policy: latestPolicy,
          },
          { status: 403 }
        );
      }

      if (errorCode === 11000) {
        const duplicateKey = transactionError as {
          keyPattern?: Record<string, number>;
          keyValue?: Record<string, unknown>;
        };
        const isRollNumberDuplicate =
          Boolean(duplicateKey.keyPattern?.rollNo) ||
          (Boolean(duplicateKey.keyPattern?._id) && duplicateKey.keyValue?._id === normalizedRollNo);

        return NextResponse.json(
          {
            error: isRollNumberDuplicate
              ? 'This roll number is already registered.'
              : 'This email address is already registered.',
          },
          { status: 409 }
        );
      }

      if (typeof errorCode === 'string' && errorCode.startsWith('CAPACITY_')) {
        return NextResponse.json(
          { error: (transactionError as Error).message },
          { status: errorCode === 'CAPACITY_MISSING' ? 404 : 409 }
        );
      }

      throw transactionError;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error('Registration error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}
