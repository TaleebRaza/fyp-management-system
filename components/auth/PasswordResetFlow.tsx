'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle, Lock, Loader2, Mail, User } from 'lucide-react';
import { GlassCard, StyledInput } from '../ui/SharedUI';
import type { ShowDialog } from '../../app/_components/PortalDialog';

export default function PasswordResetFlow({
  showDialog,
  onBack,
}: {
  showDialog: ShowDialog;
  onBack: () => void;
}) {
  const [resetStep, setResetStep] = useState(1);
  const [resetRollNo, setResetRollNo] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedRollNo = resetRollNo.trim();
    const normalizedEmail = resetEmail.trim().toLowerCase();

    if (!normalizedRollNo || !normalizedEmail) {
      showDialog({
        title: 'Account details required',
        message: 'Enter your roll number and the Gmail address where you want to receive the reset code.',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNo: normalizedRollNo, email: normalizedEmail }),
      });

      const data = await response.json();

      if (response.ok) {
        setResetStep(2);
        showDialog({
          title: 'Check your email',
          message: data.message || 'A password reset code has been sent to the Gmail address you entered.',
        });
      } else {
        showDialog({
          title: 'Reset request failed',
          message: data.error || 'Unable to send reset code. Please try again.',
        });
      }
    } catch {
      showDialog({
        title: 'Connection error',
        message: 'Unable to request a reset code right now. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedRollNo = resetRollNo.trim();
    const normalizedCode = resetCode.trim();

    if (!normalizedRollNo || !normalizedCode || !newPassword) {
      showDialog({
        title: 'Missing information',
        message: 'Enter your roll number, reset code, and new password.',
      });
      return;
    }

    if (normalizedCode.length !== 6) {
      showDialog({
        title: 'Invalid code',
        message: 'Enter the complete 6-digit reset code from your email.',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rollNo: normalizedRollNo,
          code: normalizedCode,
          newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        onBack();
        showDialog({
          title: 'Password updated',
          message: data.message || 'Your password has been updated. You can now sign in.',
        });
      } else {
        showDialog({
          title: 'Password reset failed',
          message: data.error || 'Unable to reset your password. Please try again.',
        });
      }
    } catch {
      showDialog({
        title: 'Connection error',
        message: 'Unable to reset your password right now. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const authTitle = resetStep === 1 ? 'Recover your account' : 'Set a new password';
  const authDescription = resetStep === 1
    ? 'Enter your roll number and the Gmail address where you want to receive the reset code.'
    : 'Enter the reset code from your email and choose a new password.';

  return (
    <GlassCard className="w-full p-0">
      <div className="border-b border-[var(--color-border)] px-5 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
            <Lock size={22} />
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
              {authTitle}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Account recovery
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-[var(--color-text-muted)]">
          {authDescription}
        </p>
      </div>

      <div className="px-5 py-5 sm:px-6">
        {resetStep === 1 ? (
          <form onSubmit={handleRequestCode} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                Roll No / ID
              </label>
              <StyledInput
                icon={User}
                value={resetRollNo}
                onChange={(event) => setResetRollNo(event.target.value)}
                required
                placeholder="e.g. FA20-BCS-001"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                Gmail to receive reset code
              </label>
              <StyledInput
                icon={Mail}
                type="email"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
                required
                placeholder="student@gmail.com"
                autoComplete="email"
              />
            </div>

            <button
              disabled={isLoading}
              type="submit"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Mail size={18} />}
              {isLoading ? 'Sending code...' : 'Send reset code'}
            </button>

            <button
              type="button"
              onClick={onBack}
              className="min-h-10 w-full rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)]"
            >
              Back to login
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
              <p className="text-sm font-semibold text-[var(--color-text)]">
                Code sent to your Gmail
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                Use the 6-digit code sent to{' '}
                <span className="font-semibold text-[var(--color-text)]">{resetEmail}</span> for roll number <span className="font-semibold text-[var(--color-text)]">{resetRollNo}</span>.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                6-digit code
              </label>
              <StyledInput
                value={resetCode}
                onChange={(event) => setResetCode(event.target.value)}
                required
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                New password
              </label>
              <StyledInput
                icon={Lock}
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>

            <button
              disabled={isLoading}
              type="submit"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isLoading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
              {isLoading ? 'Updating password...' : 'Update password'}
            </button>

            <button
              type="button"
              onClick={() => setResetStep(1)}
              className="min-h-10 w-full rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)]"
            >
              Request a new code
            </button>
          </form>
        )}
      </div>
    </GlassCard>
  );
}
