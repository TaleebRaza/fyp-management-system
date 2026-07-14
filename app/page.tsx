"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSession, signIn, signOut } from "next-auth/react";
import dynamic from 'next/dynamic';
import { User, Lock, Moon, Sun, ArrowRight, UserPlus, LogIn, Users, FileText, CheckCircle, XCircle, Loader2, ChevronDown, AlertTriangle, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { GlassCard, StyledInput } from '../components/ui/SharedUI';
import { PROGRAM_MAP } from '../config/appSettings';

// ✅ Lazy load dashboards
const StudentDashboard = dynamic(() => import('../components/dashboards/StudentDashboard'), {
  loading: () => <div className="flex justify-center items-center min-h-[80vh]"><Loader2 className="animate-spin" size={40}/></div>
});
const SupervisorDashboard = dynamic(() => import('../components/dashboards/SupervisorDashboard'), {
  loading: () => <div className="flex justify-center items-center min-h-[80vh]"><Loader2 className="animate-spin" size={40}/></div>
});
const AdminDashboard = dynamic(() => import('../components/dashboards/AdminDashboard'), {
  loading: () => <div className="flex justify-center items-center min-h-[80vh]"><Loader2 className="animate-spin" size={40}/></div>
});

// Temporary compatibility adapter for old dashboard/auth props.
// This is not a theme engine. It is a fixed professional palette bridge
// until the dashboard components are fully redesigned in later milestones.
const PORTAL_THEME = {
  name: 'Professional',
  bg: 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]',
  text: 'text-[var(--color-accent)]',
  ring: 'focus:ring-[var(--color-accent)]/30',
  lightBg: 'bg-[var(--color-accent-soft)]',
  gradient: '',
  border: 'border-[var(--color-accent)]',
};

const CustomSelect = ({ name, options, value, onChange, placeholder, required = false }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = value
    ? options.find((option: any) => option.value === value)?.label || value
    : placeholder;

  return (
    <div className="relative mb-4" ref={dropdownRef}>
      <input type="hidden" name={name} value={value} required={required} />

      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)]"
      >
        <span className={value ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}>
          {selectedLabel}
        </span>
        <ChevronDown
          size={18}
          className={`text-[var(--color-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="portal-scrollbar absolute z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-card)]"
          >
            {options.map((option: any) => {
              const isSelected = value === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                    isSelected
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-text)]'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {option.label}
                  {isSelected && <CheckCircle size={16} className="text-[var(--color-accent)]" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DialogModal = ({ dialog, closeDialog }: any) => {
  const [inputValue, setInputValue] = useState(dialog.defaultValue);

  useEffect(() => {
    if (dialog.isOpen) setInputValue(dialog.defaultValue || '');
  }, [dialog.isOpen, dialog.defaultValue]);

  const isDanger =
    dialog.type === 'confirm' ||
    dialog.title?.includes('Error') ||
    dialog.title?.includes('Warning');

  const handleConfirm = () => {
    const confirmedValue = inputValue;

    // Close the current dialog first.
    // This allows prompt callbacks to safely open a follow-up confirm dialog
    // without the old prompt closing it immediately after.
    closeDialog();

    Promise.resolve(
      dialog.type === 'prompt'
        ? dialog.onConfirm(confirmedValue)
        : dialog.onConfirm()
    ).catch((error) => {
      console.error('Dialog confirm handler failed:', error);
    });
  };

  return (
    <AnimatePresence>
      {dialog.isOpen && (
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center p-3 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <motion.button
            type="button"
            aria-label="Close dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 cursor-default bg-black/60"
            onClick={closeDialog}
          />

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.16 }}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-dialog)]"
          >
            <div className="border-b border-[var(--color-border)] px-5 py-4">
              <div
                className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${
                  isDanger
                    ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                    : 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                }`}
              >
                {dialog.type === 'prompt' ? (
                  <FileText size={22} />
                ) : isDanger ? (
                  <XCircle size={22} />
                ) : (
                  <CheckCircle size={22} />
                )}
              </div>

              <h3 className="text-lg font-bold tracking-tight text-[var(--color-text)]">
                {dialog.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                {dialog.message}
              </p>
            </div>

            {dialog.type === 'prompt' && (
              <div className="px-5 py-4">
                {dialog.inputType === 'select' && dialog.inputOptions ? (
                  <select
                    autoFocus
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
                  >
                    <option value="" disabled>
                      -- Make a selection --
                    </option>
                    {dialog.inputOptions.map((option: string) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : dialog.inputType === 'email' ? (
                  <input
                    type="email"
                    autoFocus
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    placeholder="Enter new email..."
                    className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-accent)]"
                  />
                ) : (
                  <textarea
                    autoFocus
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    placeholder={dialog.placeholder || 'Enter details...'}
                    rows={4}
                    className="min-h-28 w-full resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-semibold text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-accent)]"
                  />
                )}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-4 sm:flex-row sm:justify-end">
              {(dialog.type === 'prompt' || dialog.type === 'confirm') && (
                <button
                  type="button"
                  onClick={closeDialog}
                  className="min-h-10 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface)]"
                >
                  Cancel
                </button>
              )}

              <button
                type="button"
                onClick={handleConfirm}
                className={`min-h-10 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                  isDanger
                    ? 'bg-[var(--color-danger)] text-white hover:opacity-90'
                    : 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]'
                }`}
              >
                {dialog.type === 'confirm' ? 'Confirm' : dialog.type === 'prompt' ? 'Save Changes' : 'OK'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const LoginView = ({ setIsRegistering, showDialog }: any) => {
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetRollNo, setResetRollNo] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const resetRecoveryState = () => {
    setIsResetMode(false);
    setResetStep(1);
    setResetRollNo('');
    setResetEmail('');
    setResetCode('');
    setNewPassword('');
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const rollNo = String(formData.get('rollNo') || '').trim();
    const password = String(formData.get('password') || '');

    if (!rollNo || !password) {
      showDialog({
        title: 'Missing information',
        message: 'Enter your roll number and password to continue.',
      });
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        redirect: false,
        rollNo,
        password,
      });

      if (result?.error) {
        showDialog({
          title: 'Login failed',
          message: result.error,
        });
      }
    } catch (error) {
      showDialog({
        title: 'Connection error',
        message: 'Unable to sign in right now. Please check your connection and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestCode = async (event: React.FormEvent<HTMLFormElement>) => {
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
    } catch (error) {
      showDialog({
        title: 'Connection error',
        message: 'Unable to request a reset code right now. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
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
        resetRecoveryState();
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
    } catch (error) {
      showDialog({
        title: 'Connection error',
        message: 'Unable to reset your password right now. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const authTitle = isResetMode
    ? resetStep === 1
      ? 'Recover your account'
      : 'Set a new password'
    : 'Sign in to FYP Portal';

  const authDescription = isResetMode
    ? resetStep === 1
      ? 'Enter your roll number and the Gmail address where you want to receive the reset code.'
      : 'Enter the reset code from your email and choose a new password.'
    : 'Access your final year project workspace, submissions, reviews, and supervisor updates.';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.16 }}
      className="grid min-h-[calc(100vh-7rem)] items-center gap-6 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:py-10"
    >
      <section className="hidden lg:block">
        <div className="flex max-w-xl flex-col items-start justify-center">
          <div className="mb-8 flex h-28 w-28 items-center justify-center overflow-hidden rounded-[1.75rem] border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)]">
            <img src="/logo.png" alt="University Of Haripur logo" className="h-full w-full object-contain p-3" />
          </div>

          <h1 className="max-w-lg text-5xl font-black leading-tight tracking-tight text-[var(--color-text)] xl:text-6xl">
            Final Year Project Management
          </h1>

          <p className="mt-5 text-2xl font-semibold tracking-tight text-[var(--color-accent)]">
            University Of Haripur
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-md">
        <GlassCard className="w-full p-0">
          <div className="border-b border-[var(--color-border)] px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
                {isResetMode ? <Lock size={22} /> : <LogIn size={22} />}
              </div>

              <div>
                <h2 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
                  {authTitle}
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {isResetMode ? 'Account recovery' : 'Secure portal access'}
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-[var(--color-text-muted)]">
              {authDescription}
            </p>
          </div>

          <div className="px-5 py-5 sm:px-6">
            {isResetMode ? (
              resetStep === 1 ? (
                <form onSubmit={handleRequestCode} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                      Roll No / ID
                    </label>
                    <StyledInput
                      icon={User}
                      value={resetRollNo}
                      onChange={(event: any) => setResetRollNo(event.target.value)}
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
                      onChange={(event: any) => setResetEmail(event.target.value)}
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
                    onClick={resetRecoveryState}
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
                      Use the 6-digit code sent to 
                      <span className="font-semibold text-[var(--color-text)]">{resetEmail}</span> for roll number <span className="font-semibold text-[var(--color-text)]">{resetRollNo}</span>.
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                      6-digit code
                    </label>
                    <StyledInput
                      value={resetCode}
                      onChange={(event: any) => setResetCode(event.target.value)}
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
                      onChange={(event: any) => setNewPassword(event.target.value)}
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
              )
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                    Roll No / Username
                  </label>
                  <StyledInput
                    icon={User}
                    name="rollNo"
                    type="text"
                    required
                    placeholder="Enter your ID"
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                    Password
                  </label>
                  <StyledInput
                    icon={Lock}
                    name="password"
                    type="password"
                    required
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setIsResetMode(true)}
                    className="text-sm font-semibold text-[var(--color-text-strong)] underline-offset-4 transition-colors hover:text-[var(--color-accent)] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  disabled={isLoading}
                  type="submit"
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={18} /> : null}
                  {isLoading ? 'Signing in...' : 'Sign in'}
                  {!isLoading ? <ArrowRight size={18} /> : null}
                </button>
              </form>
            )}
          </div>

          {!isResetMode && (
            <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-4 text-center sm:px-6">
              <p className="text-sm text-[var(--color-text-muted)]">
                New student?{' '}
                <button
                  type="button"
                  onClick={() => setIsRegistering(true)}
                  className="font-semibold text-[var(--color-text-strong)] underline-offset-4 transition-colors hover:text-[var(--color-accent)] hover:underline"
                >
                  Create an account
                </button>
              </p>
            </div>
          )}
        </GlassCard>
      </section>
    </motion.div>
  );
};

const RegisterView = ({ setIsRegistering, supervisorsList, showDialog }: any) => {
  const [program, setProgram] = useState('BSCS');
  const [batch, setBatch] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const START_YEAR = 2021;
  const currentYear = new Date().getFullYear();
  const batchOptions: { label: string; value: string }[] = [];
  for (let year = START_YEAR; year <= currentYear + 1; year++) {
    batchOptions.push({ label: `Spring ${year}`, value: `Spring ${year}` });
    batchOptions.push({ label: `Fall ${year}`, value: `Fall ${year}` });
  }

  const programOptions = ['BSCS', 'BSTN', 'BSAI', 'BSCYS', 'BSROB', 'BSDS', 'BSSE'].map((value) => ({ label: value, value }));
  const supervisorOptions = [
    { label: 'Choose later', value: '' },
    ...(Array.isArray(supervisorsList)
      ? supervisorsList.map((sup: any) => ({
          label: `${sup.name} ${sup.isFull ? '(Capacity reached)' : `(${sup.filledSlots}/${sup.maxSlots} slots)`}`,
          value: sup._id,
          disabled: sup.isFull,
        }))
      : []),
  ];

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const registrationData = new FormData(event.currentTarget);
    const name = String(registrationData.get('name') || '').trim();
    const email = String(registrationData.get('email') || '').trim().toLowerCase();
    const rollNo = String(registrationData.get('rollNo') || '').trim();
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
    if (password.length < 6) {
      showDialog({ title: 'Password too short', message: 'Use at least 6 characters for your password.' });
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
        showDialog({ title: 'Registration failed', message: data.error || 'Unable to create your account.' });
        return;
      }
      showDialog({ title: 'Registration successful', message: data.message || 'Your account is ready. You can now sign in.' });
      setIsRegistering(false);
    } catch {
      showDialog({ title: 'Connection error', message: 'Unable to register right now. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.16 }} className="grid min-h-[calc(100vh-7rem)] items-center py-6 lg:py-10">
      <section className="mx-auto w-full max-w-2xl">
        <GlassCard className="w-full p-0">
          <div className="border-b border-[var(--color-border)] px-5 py-5 sm:px-6">
            <h2 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Create student account</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Register immediately with your email address. No registration verification code is required.</p>
          </div>
          <div className="px-5 py-5 sm:px-6">
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Full name</label><StyledInput icon={User} name="name" required placeholder="Your full name" autoComplete="name" /></div>
                <div><label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Roll No / Student ID</label><StyledInput name="rollNo" required placeholder="e.g. F23-0201" autoComplete="username" /></div>
                <div className="sm:col-span-2"><label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Email address</label><StyledInput icon={Mail} name="email" type="email" required placeholder="student@gmail.com or student@outlook.com" autoComplete="email" /><p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Use the email address where supervisors should send project updates, approvals, and rejection messages.</p></div>
                <div className="sm:col-span-2"><label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Password</label><StyledInput icon={Lock} name="password" type="password" required placeholder="Minimum 6 characters" autoComplete="new-password" /></div>
                <div><label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Program</label><CustomSelect name="program" options={programOptions} value={program} onChange={setProgram} placeholder="Select program" required /></div>
                <div><label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Batch</label><CustomSelect name="batch" options={batchOptions} value={batch} onChange={setBatch} placeholder="Select batch" required /></div>
                <div className="sm:col-span-2"><label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Supervisor</label><CustomSelect name="supervisor" options={supervisorOptions} value={supervisor} onChange={setSupervisor} placeholder="Choose supervisor" /><p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Optional. Supervisors at full capacity are disabled.</p></div>
              </div>
              <button disabled={isLoading} type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-55">{isLoading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}{isLoading ? 'Creating account...' : 'Register now'}</button>
            </form>
          </div>
          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-4 text-center sm:px-6"><p className="text-sm text-[var(--color-text-muted)]">Already have an account? <button type="button" onClick={() => setIsRegistering(false)} className="font-semibold text-[var(--color-text-strong)] underline-offset-4 transition-colors hover:text-[var(--color-accent)] hover:underline">Sign in</button></p></div>
        </GlassCard>
      </section>
    </motion.div>
  );
};

// --- MAIN APP ---
export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [supervisorsList, setSupervisorsList] = useState<any[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [dialog, setDialog] = useState({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    onConfirm: (val?: string) => {},
    defaultValue: '',
    inputType: 'text',
    inputOptions: [] as string[],
    placeholder: '',
  });

  const { data: session, status } = useSession();

  useEffect(() => {
    setIsMounted(true);
    setIsDarkMode(localStorage.getItem('fyp_theme') === 'dark');
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    localStorage.setItem('fyp_theme', isDarkMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light';
  }, [isDarkMode, isMounted]);

  // ✅ useCallback - stable function references
  const showDialog = useCallback(({ type = 'alert', title, message, onConfirm = () => {}, defaultValue = '', inputType = 'text', inputOptions = [], placeholder = '' }: any) => {
    setDialog({ isOpen: true, type, title, message, onConfirm, defaultValue, inputType, inputOptions, placeholder });
  }, []);

  const closeDialog = useCallback(() => setDialog(prev => ({ ...prev, isOpen: false })), []);

  useEffect(() => {
    if (isRegistering) fetch('/api/supervisors').then(res => res.json()).then(data => setSupervisorsList(Array.isArray(data) ? data : [])).catch(console.error);
  }, [isRegistering]);

  // ✅ useCallback - only recreated when dependencies change
  const renderView = useCallback(() => {
    if (!isMounted) return <div className="min-h-screen" />;

    if (status === "loading") {
      return (
        <div className="flex min-h-[80vh] items-center justify-center">
          <Loader2 className="animate-spin text-[var(--color-accent)]" size={40} />
        </div>
      );
    }

    if (status === "authenticated" && session?.user) {
  const role = (session.user as any).role;

  if (role === 'admin') {
    return (
      <AdminDashboard
        isDarkMode={isDarkMode}
        theme={PORTAL_THEME}
        session={session}
        showDialog={showDialog}
      />
    );
  }

  if (role === 'supervisor') {
    return (
      <SupervisorDashboard
        isDarkMode={isDarkMode}
        theme={PORTAL_THEME}
        session={session}
        showDialog={showDialog}
      />
    );
  }

  if (role === 'student') {
    return (
      <StudentDashboard
        isDarkMode={isDarkMode}
        theme={PORTAL_THEME}
        session={session}
        showDialog={showDialog}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center px-4">
      <div className="portal-card w-full p-6 text-center sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
          <AlertTriangle size={24} />
        </div>

        <h2 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
          Account role not recognized
        </h2>

        <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
          Your account is signed in, but it does not have a valid portal role.
          Please contact the administrator to assign the correct access level.
        </p>

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/' })}
          className="mt-6 min-h-10 rounded-xl bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

    return isRegistering ? (
      <RegisterView
        setIsRegistering={setIsRegistering}
        supervisorsList={supervisorsList}
        showDialog={showDialog}
      />
    ) : (
      <LoginView
        setIsRegistering={setIsRegistering}
        showDialog={showDialog}
      />
    );
  }, [isMounted, status, session, isDarkMode, isRegistering, supervisorsList, showDialog]);

    return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] transition-colors">
      <DialogModal dialog={dialog} closeDialog={closeDialog} />

      <nav className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex w-full items-center justify-between px-4 py-3 md:w-[90vw] md:px-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
              <img src="/logo.png" alt="University Logo" className="h-full w-full object-contain p-1" />
            </div>

            <h1 className="hidden text-lg font-bold tracking-tight text-[var(--color-text)] sm:block">
              FYP <span className="text-[var(--color-accent)]">Portal</span>
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setIsDarkMode(prev => !prev)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)]"
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? (
              <>
                <Sun size={18} className="text-[var(--color-accent)]" />
                <span className="hidden sm:inline">Light</span>
              </>
            ) : (
              <>
                <Moon size={18} />
                <span className="hidden sm:inline">Dark</span>
              </>
            )}
          </button>
        </div>
      </nav>

      <main className="mx-auto mt-4 w-full px-4 pb-8 md:w-[90vw] md:px-0">
        <AnimatePresence mode="wait">{renderView()}</AnimatePresence>
      </main>
    </div>
  );
}