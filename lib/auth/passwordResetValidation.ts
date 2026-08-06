import mongoose from 'mongoose';

import { PROGRAM_MAP } from '../../config/appSettings';
import { normalizeRollNo } from '../rollNo';
import { normalizeText } from '../security/input';
import { validatePassword } from '../security/password';

type PasswordResetKnowledgeInput = {
  rollNo: string;
  supervisorId: string;
  batch: string;
  program: string;
  teammateRollNo: string;
};

type PasswordResetCompletionInput = {
  rollNo: string;
  resetToken: string;
  newPassword: string;
};

type ParsedInput<T> = { ok: true; value: T } | { ok: false; error: string };

export function parsePasswordResetKnowledgeInput(input: unknown): ParsedInput<PasswordResetKnowledgeInput> {
  const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const value: PasswordResetKnowledgeInput = {
    rollNo: normalizeRollNo(body.rollNo),
    supervisorId: String(body.supervisorId || '').trim(),
    batch: normalizeText(body.batch, 20),
    program: String(body.program || '').trim().toUpperCase(),
    teammateRollNo: normalizeRollNo(body.teammateRollNo),
  };

  if (!value.rollNo || value.rollNo.length > 40) {
    return { ok: false, error: 'Enter a valid roll number or supervisor ID.' };
  }

  const hasAcademicDetails = Boolean(value.supervisorId || value.batch || value.program || value.teammateRollNo);
  if (!hasAcademicDetails) return { ok: true, value };

  const isValid = Boolean(
    value.supervisorId
    && value.batch
    && value.program
    && (value.supervisorId === 'none' || mongoose.Types.ObjectId.isValid(value.supervisorId))
    && /^(Spring|Fall) \d{4}$/.test(value.batch)
    && Object.prototype.hasOwnProperty.call(PROGRAM_MAP, value.program)
    && value.teammateRollNo.length <= 40
  );

  return isValid ? { ok: true, value } : { ok: false, error: 'Enter valid account details.' };
}

export function parsePasswordResetCompletionInput(input: unknown): ParsedInput<PasswordResetCompletionInput> {
  const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const value: PasswordResetCompletionInput = {
    rollNo: normalizeRollNo(body.rollNo),
    resetToken: String(body.resetToken || '').trim().toLowerCase(),
    newPassword: String(body.newPassword || ''),
  };

  if (!value.rollNo || !/^[a-f0-9]{64}$/.test(value.resetToken) || !validatePassword(value.newPassword)) {
    return {
      ok: false,
      error: 'A verified recovery request and a password of 10 to 128 characters are required.',
    };
  }

  return { ok: true, value };
}
