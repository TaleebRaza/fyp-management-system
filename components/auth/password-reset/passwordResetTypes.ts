import type { RegistrationSupervisor } from '../RegisterView';

export type PasswordResetStep = 'verify' | 'reset';

export type PasswordResetKnowledge = {
  rollNo: string;
  supervisorId: string;
  batch: string;
  program: string;
  teammateRollNo: string;
};

export type PasswordResetCompletion = {
  rollNo: string;
  resetToken: string;
  newPassword: string;
};

export type PasswordResetApiResult = {
  ok: boolean;
  message: string;
  resetToken?: string;
};

export type PasswordResetSupervisor = RegistrationSupervisor;
