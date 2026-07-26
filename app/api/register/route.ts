import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import Project from '../../../models/Project';
import { buildRollNoRegex, normalizeRollNo } from '../../../lib/rollNo';
import { isValidEmailAddress, normalizeEmailAddress } from '../../../lib/studentIdentity';
import { APP_SETTINGS, PROGRAM_MAP } from '../../../config/appSettings';
import { getSupervisorMaxSlots } from '../../../lib/supervisorSlots';
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

export async function POST(req: Request) {
  try {
    const { name, email, rollNo, password, supervisorId, program, batch } = await req.json();
    const normalizedName = normalizeText(name, 100);
    const normalizedEmail = normalizeEmailAddress(email);
    const normalizedRollNo = normalizeRollNo(rollNo);
    const normalizedPassword = String(password || '');
    const normalizedProgram = String(program || 'BSCS').trim().toUpperCase();
    const normalizedBatch = normalizeText(batch, 20);

    if (!normalizedName || !normalizedEmail || !normalizedRollNo || !normalizedPassword || !normalizedBatch) {
      return NextResponse.json({ error: 'Name, email, roll number, password, and batch are required.' }, { status: 400 });
    }

    if (normalizedEmail.length > 254 || !isValidEmailAddress(normalizedEmail) || normalizedRollNo.length > 40) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    if (!validatePassword(normalizedPassword)) {
      return NextResponse.json({ error: 'Password must be 10 to 128 characters.' }, { status: 400 });
    }

    if (!Object.prototype.hasOwnProperty.call(PROGRAM_MAP, normalizedProgram)) {
      return NextResponse.json({ error: 'Invalid program selected.' }, { status: 400 });
    }

      await connectToDatabase();

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

  const existingUser = await User.findOne({
      $or: [
        { email: normalizedEmail },
        { rollNo: normalizedRollNo },
        { rollNo: buildRollNoRegex(normalizedRollNo) },
      ],
    }).select('_id').lean();

    if (existingUser) {
      return NextResponse.json({ error: 'This roll number or email is already registered.' }, { status: 400 });
    }

    const matchingStudent = await User.exists({
      role: 'student', name: normalizedName, rollNo: normalizedRollNo,
      program: normalizedProgram, batch: normalizedBatch,
    });
    if (matchingStudent) {
      return NextResponse.json({ error: 'This student is already registered.' }, { status: 400 });
    }

    if (supervisorId) {
      if (!mongoose.Types.ObjectId.isValid(supervisorId)) {
        return NextResponse.json({ error: 'Invalid supervisor selected.' }, { status: 400 });
      }

      const supervisor = await User.findOne({ _id: supervisorId, role: 'supervisor' })
        .select('_id extraSlots')
        .lean();

      if (!supervisor) {
        return NextResponse.json({ error: 'Selected supervisor was not found.' }, { status: 404 });
      }

      let filledSlots = 0;
      if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'STUDENT') {
        filledSlots = await User.countDocuments({ role: 'student', supervisorId });
      } else if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'PROJECT') {
        filledSlots = await Project.countDocuments({ supervisorId });
      }

      const maxSlots = getSupervisorMaxSlots(supervisor);
      if (filledSlots >= maxSlots) {
        return NextResponse.json(
          { error: `Registration failed. The selected supervisor has reached maximum capacity (${maxSlots} slots).` },
          { status: 409 }
        );
      }
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
      return NextResponse.json({ error: 'This roll number or email is already registered.' }, { status: 400 });
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
