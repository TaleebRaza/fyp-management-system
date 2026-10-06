export type PasswordResetCompletion = {
  email: string;
  resetToken: string;
  newPassword: string;
};

export type PasswordResetApiResult = { ok: boolean; message: string; resetToken?: string };
