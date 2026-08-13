'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { ArrowRight, Loader2, Lock, LogIn, User } from 'lucide-react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Card, StyledInput } from '../ui';
import type { ShowDialog } from '../../app/_components/PortalDialog';
import PasswordResetFlow from './PasswordResetFlow';

export default function LoginView({
  onRegister,
  showDialog,
  portalPaused = false,
  portalPauseReason,
}: {
  onRegister: () => void;
  showDialog: ShowDialog;
  portalPaused?: boolean;
  portalPauseReason?: string;
}) {
  const [isResetMode, setIsResetMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
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
    } catch {
      showDialog({
        title: 'Connection error',
        message: 'Unable to sign in right now. Please check your connection and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

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
            <Image src="/logo.png" alt="University Of Haripur logo" width={112} height={112} className="h-full w-full object-contain p-3" />
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
        {isResetMode ? (
          <PasswordResetFlow
            showDialog={showDialog}
            onBack={() => setIsResetMode(false)}
          />
        ) : (
          <Card className="w-full p-0">
            <div className="border-b border-[var(--color-border)] px-5 py-5 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
                  <LogIn size={22} />
                </div>

                <div>
                  <h2 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
                    Sign in to FYP Portal
                  </h2>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {portalPaused ? 'Administrator access only' : 'Secure portal access'}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-[var(--color-text-muted)]">
                {portalPaused
                  ? portalPauseReason
                  : 'Access your final year project workspace, submissions, reviews, and supervisor updates.'}
              </p>
            </div>

            <div className="px-5 py-5 sm:px-6">
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

                {!portalPaused && <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setIsResetMode(true)}
                    className="text-sm font-semibold text-[var(--color-text-strong)] underline-offset-4 transition-colors hover:text-[var(--color-accent)] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>}

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
            </div>

            {!portalPaused && <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-4 text-center sm:px-6">
              <p className="text-sm text-[var(--color-text-muted)]">
                New student?{' '}
                <button
                  type="button"
                  onClick={onRegister}
                  className="font-semibold text-[var(--color-text-strong)] underline-offset-4 transition-colors hover:text-[var(--color-accent)] hover:underline"
                >
                  Create an account
                </button>
              </p>
            </div>}
          </Card>
        )}
      </section>
    </motion.div>
  );
}
