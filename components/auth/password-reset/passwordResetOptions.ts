import { PROGRAM_MAP } from '../../../config/appSettings';

const FIRST_PASSWORD_RESET_BATCH_YEAR = 2021;

export function buildPasswordResetBatchOptions(currentYear = new Date().getFullYear()): string[] {
  const finalYear = Math.max(currentYear + 1, FIRST_PASSWORD_RESET_BATCH_YEAR);
  const yearCount = finalYear - FIRST_PASSWORD_RESET_BATCH_YEAR + 1;

  return Array.from({ length: yearCount * 2 }, (_, index) => {
    const semester = index % 2 === 0 ? 'Spring' : 'Fall';
    const year = FIRST_PASSWORD_RESET_BATCH_YEAR + Math.floor(index / 2);
    return `${semester} ${year}`;
  });
}

export function getPasswordResetProgramOptions(): string[] {
  return Object.keys(PROGRAM_MAP);
}
