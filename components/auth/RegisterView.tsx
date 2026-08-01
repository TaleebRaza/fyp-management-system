'use client';

import { useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle, Loader2, Lock, Mail, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, Select, StyledInput } from '../ui/SharedUI';
import type { ShowDialog } from '../../app/_components/PortalDialog';
import type { RegistrationPolicyDto } from '../../types/registrationPolicy';
import { isValidRollNo, normalizeRollNo } from '../../lib/rollNo';

export type RegistrationSupervisor = {
  _id: string;
  name: string;
  isFull: boolean;
  filledSlots: number;
  maxSlots: number;
};

export default function RegisterView({
  onBack,
  supervisorsList,
  showDialog,
  registrationPolicy,
  refreshRegistrationPolicy,
}: {
  onBack: () => void;
  supervisorsList: RegistrationSupervisor[];
  showDialog: ShowDialog;
  registrationPolicy: RegistrationPolicyDto;
  refreshRegistrationPolicy: () => Promise<RegistrationPolicyDto | null>;
}) {
  const [program, setProgram] = useState('BSCS');
  const [batch, setBatch] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (registrationPolicy.isOpen === false) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.16 }} className="grid min-h-[calc(100vh-7rem)] items-center py-6 lg:py-10">
        <section className="mx-auto w-full max-w-xl">
          <Card className="w-full p-0">
            <div className="px-6 py-8 text-center sm:px-8 sm:py-10">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
                <Lock size={25} />
              </div>
              <h2 className="mt-5 text-2xl font-bold tracking-tight text-[var(--color-text)]">
                Student registration is closed
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--color-text-muted)]">
                {registrationPolicy.closedMessage}
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <button type="button" onClick={onBack} className="min-h-11 rounded-xl bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]">
                  Return to sign in
                </button>
                <button type="button" onClick={refreshRegistrationPolicy} className="min-h-11 rounded-xl border border-[var(--color-border)] px-5 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]">
                  Check again
                </button>
              </div>
            </div>
          </Card>
        </section>
      </motion.div>
    );
  }

  const START_YEAR = 2021;
  const currentYear = new Date().getFullYear();
  const batchOptions: string[] = [];
  for (let year = START_YEAR; year <= currentYear + 1; year++) {
    batchOptions.push(`Spring ${year}`, `Fall ${year}`);
  }

  const programOptions = ['BSCS', 'BSTN', 'BSAI', 'BSCYS', 'BSROB', 'BSDS', 'BSSE'];

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const registrationData = new FormData(event.currentTarget);
    const name = String(registrationData.get('name') || '').trim();
    const email = String(registrationData.get('email') || '').trim().toLowerCase();
    const rollNo = normalizeRollNo(registrationData.get('rollNo'));
    const password = String(registrationData.get('password') || '');
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name || !email || !rollNo || !password || !program || !batch) {
      showDialog({ title: 'Missing information', message: 'Complete your name, email, roll number, password, program, and batch.' });
      return;
    }

    if (!emailPattern.test(email)) {
      showDialog({ title: 'Invalid email', message: 'Enter a valid email address.' });
      return;
    }

    if (!isValidRollNo(rollNo)) {
      showDialog({
        title: 'Invalid roll number',
        message: 'Use F or S, followed by two digits, a hyphen, and four digits. Example: F23-0201.',
      });
      return;
    }

    if (password.length < 10) {
      showDialog({ title: 'Password too short', message: 'Use at least 10 characters for your password.' });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, rollNo, password, supervisorId: supervisor, program, batch }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === 'REGISTRATION_CLOSED') {
          await refreshRegistrationPolicy();
        }
        showDialog({ title: 'Registration failed', message: data.error || 'Unable to create your account.' });
        return;
      }
      showDialog({ title: 'Registration successful', message: data.message || 'Your account is ready. You can now sign in.' });
      onBack();
    } catch {
      showDialog({ title: 'Connection error', message: 'Unable to register right now. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.16 }} className="grid min-h-[calc(100vh-7rem)] items-center py-6 lg:py-10">
      <section className="mx-auto w-full max-w-2xl">
        <Card className="w-full p-0">
          <div className="border-b border-[var(--color-border)] px-5 py-5 sm:px-6">
            <h2 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Create student account</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Register immediately with your email address. No registration verification code is required.</p>
          </div>
          <div className="px-5 py-5 sm:px-6">
            {registrationPolicy.punishment.enabled && (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-4 py-3">
                <AlertTriangle className="mt-0.5 shrink-0 text-[var(--color-accent)]" size={19} />
                <div>
                  <p className="text-sm font-bold text-[var(--color-text)]">
                    {registrationPolicy.punishment.category === 'fine'
                      ? `${registrationPolicy.punishment.title}: PKR ${Number(registrationPolicy.punishment.amount || 0).toLocaleString()}`
                      : registrationPolicy.punishment.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                    {registrationPolicy.punishment.description}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-[var(--color-text-muted)]">
                    This will be recorded on accounts created while the policy is active.
                  </p>
                </div>
              </div>
            )}
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Full name</label><StyledInput icon={User} name="name" required placeholder="Your full name" autoComplete="name" /></div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Roll No / Student ID</label>
                  <StyledInput
                    name="rollNo"
                    required
                    placeholder="e.g. F23-0201"
                    autoComplete="username"
                    autoCapitalize="characters"
                    maxLength={8}
                    pattern="[FSfs][0-9]{2}-[0-9]{4}"
                    title="Use F or S, two digits, a hyphen, and four digits (for example, F23-0201)."
                    onInput={(event) => {
                      event.currentTarget.value = event.currentTarget.value.toUpperCase();
                    }}
                  />
                  <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                    Required format: F23-0201 or S23-0201. Each roll number can register only once.
                  </p>
                </div>
                <div className="sm:col-span-2"><label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Email address</label><StyledInput icon={Mail} name="email" type="email" required placeholder="student@gmail.com or student@outlook.com" autoComplete="email" /><p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Use the email address where supervisors should send project updates, approvals, and rejection messages.</p></div>
                <div className="sm:col-span-2"><label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Password</label><StyledInput icon={Lock} name="password" type="password" required minLength={10} maxLength={128} placeholder="Minimum 10 characters" autoComplete="new-password" /></div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Program</label>
                  <Select name="program" value={program} onChange={(event) => setProgram(event.target.value)} required>
                    {programOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Batch</label>
                  <Select name="batch" value={batch} onChange={(event) => setBatch(event.target.value)} required>
                    <option value="" disabled>Select batch</option>
                    {batchOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Supervisor</label>
                  <Select name="supervisor" value={supervisor} onChange={(event) => setSupervisor(event.target.value)}>
                    <option value="">Choose supervisor</option>
                    {supervisorsList.map((option) => (
                      <option key={option._id} value={option._id} disabled={option.isFull}>
                        {option.name} {option.isFull ? '(Capacity reached)' : `(${option.filledSlots}/${option.maxSlots} slots)`}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Optional. Supervisors at full capacity are disabled.</p>
                </div>
              </div>
              <button disabled={isLoading} type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-55">{isLoading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}{isLoading ? 'Creating account...' : 'Register now'}</button>
            </form>
          </div>
          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-4 text-center sm:px-6"><p className="text-sm text-[var(--color-text-muted)]">Already have an account? <button type="button" onClick={onBack} className="font-semibold text-[var(--color-text-strong)] underline-offset-4 transition-colors hover:text-[var(--color-accent)] hover:underline">Sign in</button></p></div>
        </Card>
      </section>
    </motion.div>
  );
}
