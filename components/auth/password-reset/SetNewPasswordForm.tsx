'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { CheckCircle, Loader2, Lock } from 'lucide-react';

import { StyledInput } from '../../ui/SharedUI';

type SetNewPasswordFormProps = {
  rollNo: string;
  newPassword: string;
  onNewPasswordChange: (value: string) => void;
  isLoading: boolean;
  onSubmit: () => Promise<void>;
  onReturnToVerification: () => void;
};

export function SetNewPasswordForm({
  rollNo,
  newPassword,
  onNewPasswordChange,
  isLoading,
  onSubmit,
  onReturnToVerification,
}: SetNewPasswordFormProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
        <p className="text-sm font-semibold text-[var(--color-text)]">Identity verified</p>
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
          Set a new password for{' '}
          <span className="font-semibold text-[var(--color-text)]">{rollNo}</span>.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
          New password
        </label>
        <StyledInput
          icon={Lock}
          type="password"
          value={newPassword}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onNewPasswordChange(event.target.value)}
          required
          minLength={10}
          maxLength={128}
          placeholder="10 to 128 characters"
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
        onClick={onReturnToVerification}
        className="min-h-10 w-full rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)]"
      >
        Verify different details
      </button>
    </form>
  );
}
