export type PasswordResetCompletion = {
  email: string;
  otp: string;
  newPassword: string;
};

export type PasswordResetApiResult = { ok: boolean; message: string };
