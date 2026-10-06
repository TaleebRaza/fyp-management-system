'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { Loader2, Mail } from 'lucide-react';
import { Button, Dialog, StyledInput } from '../ui';
import type { StudentDashboardProps } from './studentDashboardTypes';

export default function StudentEmailChange({ currentEmail, showDialog }: {
  currentEmail?: string;
  showDialog: StudentDashboardProps['showDialog'];
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function close() {
    if (busy) return;
    setOpen(false);
    setEmail(''); setPassword(''); setOtp(''); setRequested(false); setMessage('');
  }
  async function submit() {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/dashboard/student/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: requested ? 'confirm' : 'request', email, password, ...(requested ? { otp } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) { setMessage(body.error || 'Unable to change email.'); return; }
      if (!requested) { setRequested(true); setMessage(body.message); return; }
      setPassword(''); setOtp(''); setOpen(false);
      try { await signOut({ redirect: false }); } catch {
        showDialog({ title: 'Email updated', message: 'Your email was updated. Please sign out and sign in again.' });
        return;
      }
      showDialog({ title: 'Email updated', message: body.message });
    } catch {
      setMessage('Unable to complete this request. Please try again.');
    } finally { setBusy(false); }
  }

  return <>
    <Button variant="outline" className="w-full" onClick={() => setOpen(true)}><Mail size={15} />Change email</Button>
    <Dialog open={open} onClose={close} closeDisabled={busy} title="Change account email" description="Verify your new student email. One change every 24 hours.">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <p className="break-all text-sm text-[var(--color-text-muted)]">Current email: {currentEmail || 'Not assigned'}</p>
        <div>
          <label htmlFor="student-new-email" className="mb-2 block text-sm font-semibold">New student email</label>
          <StyledInput id="student-new-email" type="email" required maxLength={254} pattern="[^@\s]+@student\.uoh\.edu\.pk" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} readOnly={requested} placeholder="name@student.uoh.edu.pk" />
        </div>
        <div>
          <label htmlFor="student-email-password" className="mb-2 block text-sm font-semibold">Current password</label>
          <StyledInput id="student-email-password" type="password" required maxLength={128} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
        </div>
        {requested && <div>
          <label htmlFor="student-email-otp" className="mb-2 block text-sm font-semibold">Six-digit code</label>
          <StyledInput id="student-email-otp" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value)} disabled={busy} />
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">Code expires after 10 minutes. Five attempts per code.</p>
        </div>}
        {message && <p role="status" className="text-sm leading-6 text-[var(--color-text-muted)]">{message}</p>}
        <p className="text-xs text-[var(--color-text-muted)]">Saving signs you out of all sessions.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={busy}>Cancel</Button>
          {requested && <Button type="button" variant="outline" disabled={busy} onClick={() => { setRequested(false); setOtp(''); setMessage('Wait two minutes between code requests.'); }}>Request another code</Button>}
          <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" size={16} />}{requested ? 'Verify and save email' : 'Send verification code'}</Button>
        </div>
      </form>
    </Dialog>
  </>;
}
