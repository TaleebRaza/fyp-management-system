import { PROGRAM_MAP } from '../../../config/appSettings';
export { buildAcademicBatchOptions as buildPasswordResetBatchOptions } from '../../../config/academicOptions';

export function getPasswordResetProgramOptions(): string[] {
  return Object.keys(PROGRAM_MAP);
}
