import { randomBytes } from 'crypto';

import bcrypt from 'bcryptjs';

import connectToDatabase from '../mongodb';
import Project from '../../models/Project';
import User from '../../models/User';
import { buildRollNoRegex, normalizeRollNo } from '../rollNo';
import { consumeRateLimit } from '../rateLimit';
import { isPortalActivityActorRole, recordPortalActivity } from '../portalActivityLog';
import { matchesPasswordResetKnowledge } from '../security/passwordResetKnowledge';
import {
  parsePasswordResetCompletionInput,
  parsePasswordResetKnowledgeInput,
} from './passwordResetValidation';

const PASSWORD_RESET_REQUEST_LIMIT = 5;
const PASSWORD_RESET_ATTEMPT_LIMIT = 10;
const PASSWORD_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const DETAILS_MISMATCH_ERROR = 'The account details do not match our records.';
const INVALID_TOKEN_ERROR = 'Account recovery has expired. Verify your details again.';

type PasswordResetBody = Record<string, unknown>;

export type PasswordResetServiceResult = {
  status: number;
  body: PasswordResetBody;
};

function result(status: number, body: PasswordResetBody): PasswordResetServiceResult {
  return { status, body };
}

async function findPasswordResetUserByRollNo(rollNo: string, includeResetCode = false) {
  const filter = { role: { $in: ['student', 'supervisor'] }, rollNo };
  const select = includeResetCode ? '+resetCode +resetCodeExpiry' : '';
  const exactUser = await User.findOne(filter).select(select);
  if (exactUser) return exactUser;

  return await User.findOne({ ...filter, rollNo: buildRollNoRegex(rollNo) }).select(select);
}

function passwordChangeCooldown(lastPasswordChange: Date | null | undefined) {
  if (!lastPasswordChange) return null;

  const remaining = PASSWORD_CHANGE_COOLDOWN_MS - (Date.now() - new Date(lastPasswordChange).getTime());
  if (remaining <= 0) return null;

  return result(429, {
    error: `Password was changed recently. Please try again in ${Math.ceil(remaining / 3_600_000)} hours.`,
  });
}

export async function verifyPasswordResetKnowledge(input: unknown): Promise<PasswordResetServiceResult> {
  const parsed = parsePasswordResetKnowledgeInput(input);
  if (!parsed.ok) return result(400, { error: parsed.error });

  await connectToDatabase();
  const { rollNo, supervisorId, batch, program, teammateRollNo } = parsed.value;
  const rateLimit = await consumeRateLimit(
    `forgot-password:${rollNo.toLowerCase()}`,
    PASSWORD_RESET_REQUEST_LIMIT
  );
  if (!rateLimit.allowed) {
    return result(429, {
      error: 'Too many password reset attempts. Please try again in an hour.',
    });
  }

  const user = await findPasswordResetUserByRollNo(rollNo);
  if (!user) return result(400, { error: DETAILS_MISMATCH_ERROR });

  if (user.role === 'student') {
    const project = user.projectId
      ? await Project.findOne({ _id: user.projectId, members: user._id }).select('members').lean()
      : null;
    const projectMembers = Array.isArray(project?.members) ? project.members : [];
    const teammateIds = projectMembers.filter(
      (memberId: unknown) => String(memberId) !== String(user._id)
    );
    const teammates = teammateIds.length
      ? await User.find({ _id: { $in: teammateIds }, role: 'student' }).select('rollNo').lean()
      : [];

    const detailsMatch = matchesPasswordResetKnowledge(
      {
        rollNo: normalizeRollNo(user.rollNo),
        supervisorId: user.supervisorId ? String(user.supervisorId) : 'none',
        batch: String(user.batch || '').trim(),
        program: String(user.program || '').trim().toUpperCase(),
        teammateRollNos: (teammates as Array<{ rollNo?: unknown }>).map((teammate) =>
          normalizeRollNo(teammate.rollNo)
        ),
        requiresTeammate: teammates.length > 0,
      },
      { rollNo, supervisorId, batch, program, teammateRollNo }
    );
    if (!detailsMatch) return result(400, { error: DETAILS_MISMATCH_ERROR });
  }

  const cooldown = passwordChangeCooldown(user.lastPasswordChange);
  if (cooldown) return cooldown;

  const resetToken = randomBytes(32).toString('hex');
  await User.findByIdAndUpdate(user._id, {
    resetCode: await bcrypt.hash(resetToken, 10),
    resetCodeExpiry: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
  });

  return result(200, {
    message: user.role === 'supervisor'
      ? 'Supervisor ID verified. Choose a new password.'
      : 'Account details verified. Choose a new password.',
    resetToken,
  });
}

export async function completePasswordReset(input: unknown): Promise<PasswordResetServiceResult> {
  const parsed = parsePasswordResetCompletionInput(input);
  if (!parsed.ok) return result(400, { error: parsed.error });

  await connectToDatabase();
  const { rollNo, resetToken, newPassword } = parsed.value;
  const rateLimit = await consumeRateLimit(
    `reset-password:${rollNo.toLowerCase()}`,
    PASSWORD_RESET_ATTEMPT_LIMIT
  );
  if (!rateLimit.allowed) {
    return result(429, {
      error: 'Too many password reset attempts. Please try again in an hour.',
    });
  }

  const user = await findPasswordResetUserByRollNo(rollNo, true);
  const tokenIsValid = Boolean(
    user
    && user.resetCode
    && user.resetCodeExpiry
    && new Date(user.resetCodeExpiry).getTime() > Date.now()
    && await bcrypt.compare(resetToken, user.resetCode)
  );
  if (!user || !tokenIsValid) return result(400, { error: INVALID_TOKEN_ERROR });

  const updateResult = await User.updateOne(
    {
      _id: user._id,
      role: { $in: ['student', 'supervisor'] },
      resetCode: user.resetCode,
      resetCodeExpiry: { $gt: new Date() },
    },
    {
      $set: {
        password: await bcrypt.hash(newPassword, 10),
        resetCode: null,
        resetCodeExpiry: null,
        lastPasswordChange: new Date(),
      },
    }
  );

  if (updateResult.modifiedCount !== 1) {
    return result(400, { error: INVALID_TOKEN_ERROR });
  }

  if (isPortalActivityActorRole(user.role)) {
    await recordPortalActivity({
      action: 'password-changed',
      actorId: user._id.toString(),
      actorRole: user.role,
    });
  }

  return result(200, { message: 'Password successfully updated! You can now log in.' });
}
