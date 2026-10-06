'use client';

import { Loader2, Lock, Mail } from 'lucide-react';
import type { ShowDialog } from '../../app/_components/PortalDialog';
import { Card, StyledInput } from '../ui';
import { usePasswordResetFlow } from './password-reset/usePasswordResetFlow';

export default function PasswordResetFlow({ showDialog, onBack }: { showDialog: ShowDialog; onBack: () => void }) {
  const flow = usePasswordResetFlow({ showDialog, onBack });
  const buttonClass = 'flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-55';

  return (
    <Card className="w-full p-0">
      <div className="border-b border-[var(--color-border)] px-5 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white"><Lock size={22} /></div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Reset your password</h2>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--color-text-muted)]">
          {flow.codeRequested ? 'Enter the code from your email and choose a new password.' : 'Students: use your registered @student.uoh.edu.pk email. Staff and admins: use your registered email.'}
        </p>
      </div>
      <div className="px-5 py-5 sm:px-6">
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void (flow.codeRequested ? flow.resetPassword() : flow.requestCode()); }}>
          <div>
            <label htmlFor="reset-email" className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Registered email</label>
            <StyledInput id="reset-email" icon={Mail} type="email" value={flow.email} onChange={(event) => flow.setEmail(event.target.value)} required maxLength={254} autoComplete="email" readOnly={flow.codeRequested} disabled={flow.isLoading} />
          </div>
          {flow.codeRequested && <>
            <div>
              <label htmlFor="reset-otp" className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Six-digit code</label>
              <StyledInput id="reset-otp" value={flow.otp} onChange={(event) => flow.setOtp(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="one-time-code" required disabled={flow.isLoading} />
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">Expires after 10 minutes. Five attempts per code.</p>
            </div>
            <div>
              <label htmlFor="reset-password" className="mb-2 block text-sm font-semibold text-[var(--color-text)]">New password</label>
              <StyledInput id="reset-password" icon={Lock} type="password" value={flow.newPassword} onChange={(event) => flow.setNewPassword(event.target.value)} required minLength={10} maxLength={128} placeholder="10 to 128 characters" autoComplete="new-password" disabled={flow.isLoading} />
            </div>
            <div>
              <label htmlFor="reset-confirm" className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Confirm new password</label>
              <StyledInput id="reset-confirm" icon={Lock} type="password" value={flow.confirmPassword} onChange={(event) => flow.setConfirmPassword(event.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" disabled={flow.isLoading} />
            </div>
          </>}
          <button type="submit" disabled={flow.isLoading} className={buttonClass}>
            {flow.isLoading && <Loader2 className="animate-spin" size={18} />}
            {flow.isLoading ? 'Please wait...' : flow.codeRequested ? 'Update password' : 'Send reset code'}
          </button>
          {flow.codeRequested && <>
            <button type="button" onClick={() => void flow.requestCode()} disabled={flow.isLoading || flow.secondsRemaining > 0} className="min-h-10 w-full rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] disabled:opacity-55">
              {flow.secondsRemaining > 0 ? `Resend available in ${flow.secondsRemaining}s` : 'Resend code'}
            </button>
            <button type="button" onClick={flow.changeEmail} disabled={flow.isLoading} className="min-h-10 w-full text-sm font-semibold text-[var(--color-text)]">Use another email</button>
          </>}
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">One email every two minutes, up to three emails. After the third email, wait 24 hours before requesting another. Resending replaces the previous code.</p>
          <button type="button" onClick={onBack} disabled={flow.isLoading} className="min-h-10 w-full rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]">Back to login</button>
        </form>
      </div>
    </Card>
  );
}
