import { normalizeRollNo } from './rollNo';

export const UNIVERSITY_EMAIL_PATTERN = /^([a-zA-Z]{1,3}\d{2}[-.]\d{3,5}|[a-zA-Z]{2}\d{2}[-.][a-zA-Z]{3}[-.]\d{3}|[a-zA-Z0-9]+[-.][a-zA-Z0-9]+)@(student\.)?uoh\.edu\.pk$/i;

export function normalizeUniversityEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeIdentityKey(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function getUniversityEmailLocalPart(email: unknown) {
  return normalizeUniversityEmail(email).split('@')[0] || '';
}

export function doesRollNoMatchUniversityEmail(rollNo: unknown, email: unknown) {
  const normalizedRollNo = normalizeRollNo(rollNo);
  const normalizedEmail = normalizeUniversityEmail(email);

  if (!normalizedRollNo || !normalizedEmail || !UNIVERSITY_EMAIL_PATTERN.test(normalizedEmail)) {
    return false;
  }

  return normalizeIdentityKey(normalizedRollNo) === normalizeIdentityKey(getUniversityEmailLocalPart(normalizedEmail));
}

export function getExpectedUniversityEmailExample(rollNo: unknown) {
  const normalizedRollNo = normalizeRollNo(rollNo).toLowerCase();
  return normalizedRollNo ? `${normalizedRollNo}@student.uoh.edu.pk` : 'f23-0201@student.uoh.edu.pk';
}

export function buildManualVerificationPhrase(rollNo: unknown) {
  const normalizedRollNo = normalizeRollNo(rollNo).replace(/[^A-Z0-9-]/g, '');
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `FYP-${normalizedRollNo}-${randomPart}`;
}