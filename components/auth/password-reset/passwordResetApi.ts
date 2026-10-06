import type { PasswordResetApiResult, PasswordResetCompletion } from './passwordResetTypes';

async function postReset(path: string, details: object): Promise<PasswordResetApiResult> {
  const response = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  });
  const body = await response.json();
  return {
    ok: response.ok,
    message: typeof (response.ok ? body.message : body.error) === 'string'
      ? (response.ok ? body.message : body.error) : 'Unable to process password recovery. Please try again.',
  };
}

export const requestPasswordReset = (email: string) => postReset('forgot-password', { email });
export const completePasswordReset = (details: PasswordResetCompletion) => postReset('reset-password', details);
