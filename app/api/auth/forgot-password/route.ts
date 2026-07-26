import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import { buildRollNoRegex, normalizeRollNo } from '../../../../lib/rollNo';
import { consumeRateLimit } from '../../../../lib/rateLimit';
import { normalizeText } from '../../../../lib/security/input';
import { matchesPasswordResetKnowledge } from '../../../../lib/security/passwordResetKnowledge';
import { PROGRAM_MAP } from '../../../../config/appSettings';

const PASSWORD_RESET_REQUEST_LIMIT = 5;
const PASSWORD_CHANGE_COOLDOWN_MS = 5 * 60 * 60 * 1000;
const RESET_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const DETAILS_MISMATCH_ERROR = 'The account details do not match our records.';

export async function POST(req: Request) {
  try {
    const { rollNo, supervisorId, batch, program, teammateRollNo } = await req.json();
    const normalizedRollNo = normalizeRollNo(rollNo);
    const normalizedSupervisorId = String(supervisorId || '').trim();
    const normalizedBatch = normalizeText(batch, 20);
    const normalizedProgram = String(program || '').trim().toUpperCase();
    const normalizedTeammateRollNo = normalizeRollNo(teammateRollNo);

    if (!normalizedRollNo || !normalizedSupervisorId || !normalizedBatch || !normalizedProgram) {
      return NextResponse.json({ error: 'Roll number, supervisor, batch, and program are required.' }, { status: 400 });
    }

    if (
      normalizedRollNo.length > 40
      || (normalizedSupervisorId !== 'none' && !mongoose.Types.ObjectId.isValid(normalizedSupervisorId))
      || !/^(Spring|Fall) \d{4}$/.test(normalizedBatch)
      || !Object.prototype.hasOwnProperty.call(PROGRAM_MAP, normalizedProgram)
      || normalizedTeammateRollNo.length > 40
    ) {
      return NextResponse.json({ error: 'Enter valid account details.' }, { status: 400 });
    }

    await connectToDatabase();

    const rateLimitKey = `forgot-password:${normalizedRollNo.toLowerCase()}`;
    const rateLimit = await consumeRateLimit(rateLimitKey, PASSWORD_RESET_REQUEST_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many password reset attempts. Please try again in an hour.' }, { status: 429 });
    }

    let user = await User.findOne({ role: 'student', rollNo: normalizedRollNo });
    if (!user) {
      user = await User.findOne({ role: 'student', rollNo: buildRollNoRegex(normalizedRollNo) });
    }

    if (!user) {
      return NextResponse.json({ error: DETAILS_MISMATCH_ERROR }, { status: 400 });
    }

    const project = user.projectId
      ? await Project.findOne({ _id: user.projectId, members: user._id }).select('members').lean()
      : null;
    const teammateIds = (project?.members || []).filter(
      (memberId: unknown) => String(memberId) !== String(user._id)
    );
    const teammates = teammateIds.length > 0
      ? await User.find({ _id: { $in: teammateIds }, role: 'student' }).select('rollNo').lean()
      : [];

    const detailsMatch = matchesPasswordResetKnowledge(
      {
        rollNo: normalizeRollNo(user.rollNo),
        supervisorId: user.supervisorId ? String(user.supervisorId) : 'none',
        batch: String(user.batch || '').trim(),
        program: String(user.program || '').trim().toUpperCase(),
        teammateRollNos: teammates.map((teammate) => normalizeRollNo(teammate.rollNo)),
        requiresTeammate: teammates.length > 0,
      },
      {
        rollNo: normalizedRollNo,
        supervisorId: normalizedSupervisorId,
        batch: normalizedBatch,
        program: normalizedProgram,
        teammateRollNo: normalizedTeammateRollNo,
      }
    );

    if (!detailsMatch) {
      return NextResponse.json({ error: DETAILS_MISMATCH_ERROR }, { status: 400 });
    }

    if (user.lastPasswordChange) {
      const timeSinceLastChange = Date.now() - new Date(user.lastPasswordChange).getTime();
      if (timeSinceLastChange < PASSWORD_CHANGE_COOLDOWN_MS) {
        const hoursLeft = Math.ceil((PASSWORD_CHANGE_COOLDOWN_MS - timeSinceLastChange) / 3600000);
        return NextResponse.json(
          { error: `Password was changed recently. Please try again in ${hoursLeft} hours.` },
          { status: 429 }
        );
      }
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenHash = await bcrypt.hash(resetToken, 10);
    const resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

    await User.findByIdAndUpdate(user._id, {
      resetCode: resetTokenHash,
      resetCodeExpiry: resetTokenExpiry,
    });

    return NextResponse.json({
      message: 'Account details verified. Choose a new password.',
      resetToken,
    });
  } catch (error) {
    console.error('Forgot Password Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to verify account details.' }, { status: 500 });
  }
}
