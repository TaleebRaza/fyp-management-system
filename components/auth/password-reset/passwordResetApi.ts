import type {
  PasswordResetApiResult,
  PasswordResetCompletion,
  PasswordResetKnowledge,
  PasswordResetSupervisor,
} from './passwordResetTypes';

type ApiBody = {
  error?: unknown;
  message?: unknown;
  resetToken?: unknown;
};

async function readApiBody(response: Response): Promise<ApiBody> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' ? (value as ApiBody) : {};
  } catch {
    return {};
  }
}

function readMessage(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export async function loadPasswordResetSupervisors(): Promise<PasswordResetSupervisor[]> {
  const response = await fetch('/api/supervisors');
  const value: unknown = await response.json();
  return Array.isArray(value) ? (value as PasswordResetSupervisor[]) : [];
}

export async function verifyPasswordResetDetails(
  details: PasswordResetKnowledge
): Promise<PasswordResetApiResult> {
  const response = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  });
  const body = await readApiBody(response);

  if (!response.ok || typeof body.resetToken !== 'string') {
    return {
      ok: false,
      message: readMessage(body.error, 'The account details do not match our records.'),
    };
  }

  return {
    ok: true,
    message: readMessage(
      body.message,
      'Your account details were verified. Choose a new password.'
    ),
    resetToken: body.resetToken,
  };
}

export async function completePasswordReset(
  details: PasswordResetCompletion
): Promise<PasswordResetApiResult> {
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  });
  const body = await readApiBody(response);

  return response.ok
    ? {
        ok: true,
        message: readMessage(
          body.message,
          'Your password has been updated. You can now sign in.'
        ),
      }
    : {
        ok: false,
        message: readMessage(body.error, 'Unable to reset your password. Please try again.'),
      };
}
