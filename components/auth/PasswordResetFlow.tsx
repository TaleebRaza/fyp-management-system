'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle, Lock, Loader2, User } from 'lucide-react';
import { GlassCard, Select, StyledInput } from '../ui/SharedUI';
import type { ShowDialog } from '../../app/_components/PortalDialog';
import type { RegistrationSupervisor } from './RegisterView';
import { PROGRAM_MAP } from '../../config/appSettings';

export default function PasswordResetFlow({
  showDialog,
  onBack,
}: {
  showDialog: ShowDialog;
  onBack: () => void;
}) {
  const [resetStep, setResetStep] = useState(1);
  const [resetRollNo, setResetRollNo] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [batch, setBatch] = useState('');
  const [program, setProgram] = useState('');
  const [teammateRollNo, setTeammateRollNo] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [supervisors, setSupervisors] = useState<RegistrationSupervisor[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetch('/api/supervisors')
      .then((response) => response.json())
      .then((data) => setSupervisors(Array.isArray(data) ? data : []))
      .catch((error) => console.error('Unable to load supervisors:', error));
  }, []);

  const currentYear = new Date().getFullYear();
  const batchOptions = Array.from(
    { length: (currentYear + 1 - 2021 + 1) * 2 },
    (_, index) => `${index % 2 === 0 ? 'Spring' : 'Fall'} ${2021 + Math.floor(index / 2)}`
  );

  const handleVerifyDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedRollNo = resetRollNo.trim();
    const normalizedTeammateRollNo = teammateRollNo.trim();

    if (!normalizedRollNo || !supervisorId || !batch || !program) {
      showDialog({
        title: 'Account details required',
        message: 'Enter your roll number and select your supervisor, batch, and program.',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rollNo: normalizedRollNo,
          supervisorId,
          batch,
          program,
          teammateRollNo: normalizedTeammateRollNo,
        }),
      });

      const data = await response.json();

      if (response.ok && typeof data.resetToken === 'string') {
        setResetToken(data.resetToken);
        setResetStep(2);
        showDialog({
          title: 'Details verified',
          message: data.message || 'Your account details were verified. Choose a new password.',
        });
      } else {
        showDialog({
          title: 'Verification failed',
          message: data.error || 'The account details do not match our records.',
        });
      }
    } catch {
      showDialog({
        title: 'Connection error',
        message: 'Unable to verify your account details right now. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedRollNo = resetRollNo.trim();

    if (!normalizedRollNo || !resetToken || !newPassword) {
      showDialog({
        title: 'Missing information',
        message: 'Verify your account details and enter a new password.',
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
          resetToken,
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

  const returnToVerification = () => {
    setResetToken('');
    setResetStep(1);
  };

  return (
    <GlassCard className="w-full p-0">
      <div className="border-b border-[var(--color-border)] px-5 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
            <Lock size={22} />
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
              {resetStep === 1 ? 'Recover your account' : 'Set a new password'}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Account recovery</p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-[var(--color-text-muted)]">
          {resetStep === 1
            ? 'Verify the academic details already recorded on your account.'
            : 'Your account details are verified. Choose a new password.'}
        </p>
      </div>

      <div className="px-5 py-5 sm:px-6">
        {resetStep === 1 ? (
          <form onSubmit={handleVerifyDetails} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Roll No / ID</label>
              <StyledInput
                icon={User}
                value={resetRollNo}
                onChange={(event) => setResetRollNo(event.target.value)}
                required
                placeholder="e.g. F23-0201"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Supervisor</label>
              <Select value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)} required>
                <option value="">Select supervisor</option>
                <option value="none">No supervisor assigned</option>
                {supervisors.map((supervisor) => (
                  <option key={supervisor._id} value={supervisor._id}>{supervisor.name}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Batch</label>
              <Select value={batch} onChange={(event) => setBatch(event.target.value)} required>
                <option value="">Select batch</option>
                {batchOptions.map((batchOption) => (
                  <option key={batchOption} value={batchOption}>{batchOption}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Program</label>
              <Select value={program} onChange={(event) => setProgram(event.target.value)} required>
                <option value="">Select program</option>
                {Object.keys(PROGRAM_MAP).map((programOption) => (
                  <option key={programOption} value={programOption}>{programOption}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Teammate roll no</label>
              <StyledInput
                value={teammateRollNo}
                onChange={(event) => setTeammateRollNo(event.target.value)}
                placeholder="Required only if you have a teammate"
              />
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                Leave this blank only if you are not currently in a team.
              </p>
            </div>

            <button
              disabled={isLoading}
              type="submit"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isLoading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
              {isLoading ? 'Verifying details...' : 'Verify account details'}
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
              <p className="text-sm font-semibold text-[var(--color-text)]">Identity verified</p>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                Set a new password for <span className="font-semibold text-[var(--color-text)]">{resetRollNo}</span>.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">New password</label>
              <StyledInput
                icon={Lock}
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
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
              onClick={returnToVerification}
              className="min-h-10 w-full rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)]"
            >
              Verify different details
            </button>
          </form>
        )}
      </div>
    </GlassCard>
  );
}
