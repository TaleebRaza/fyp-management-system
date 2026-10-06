'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import type { ShowDialog } from '../../../app/_components/PortalDialog';
import { completePasswordReset, requestPasswordReset } from './passwordResetApi';

export function usePasswordResetFlow({ showDialog, onBack }: { showDialog: ShowDialog; onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [codeRequested, setCodeRequested] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (!resendAt) return;
    const update = () => setSecondsRemaining(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  async function requestCode() {
    if (isLoading || secondsRemaining > 0) return;
    setIsLoading(true);
    try {
      const result = await requestPasswordReset(email.trim().toLowerCase());
      if (result.ok) {
        setCodeRequested(true);
        setOtp('');
        setResendAt(Date.now() + 120_000);
        setSecondsRemaining(120);
      }
      showDialog({ title: result.ok ? 'Check your email' : 'Code request failed', message: result.message });
    } catch {
      showDialog({ title: 'Connection error', message: 'Unable to request a code. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  }

  async function resetPassword() {
    if (isLoading) return;
    if (newPassword !== confirmPassword) {
      showDialog({ title: 'Passwords do not match', message: 'Enter the same new password in both fields.' });
      return;
    }
    setIsLoading(true);
    try {
      const result = await completePasswordReset({ email, otp, newPassword });
      if (result.ok) {
        try {
          await signOut({ redirect: false });
        } catch {
          onBack();
          showDialog({ title: 'Password updated', message: `${result.message} Other open tabs could not be signed out automatically. Please sign out of them before signing in again.` });
          return;
        }
        onBack();
        showDialog({ title: 'Password updated', message: result.message });
        return;
      }
      showDialog({ title: 'Password reset failed', message: result.message });
    } catch {
      showDialog({ title: 'Connection error', message: 'Unable to reset your password. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  }

  function changeEmail() {
    setCodeRequested(false);
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setResendAt(0);
    setSecondsRemaining(0);
  }

  return {
    email, setEmail, codeRequested, otp, setOtp, newPassword, setNewPassword,
    confirmPassword, setConfirmPassword, isLoading, secondsRemaining, requestCode, resetPassword, changeEmail,
  };
}
