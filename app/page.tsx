"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from "next-auth/react";
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { Moon, Sun, Loader2, AlertTriangle } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';

import SessionIntro from '../components/ui/SessionIntro';
import LoginView from '../components/auth/LoginView';
import RegisterView, {
  type RegistrationSupervisor,
} from '../components/auth/RegisterView';
import PortalDialog, {
  type DialogOptions,
  type PortalDialogState,
} from './_components/PortalDialog';
import {
  DEFAULT_REGISTRATION_POLICY,
  type RegistrationPolicyDto,
} from '../types/registrationPolicy';

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

// Fixed compatibility adapter for the existing dashboard/auth theme props.
// This is not a theme engine.
type IntroState = 'checking' | 'showing' | 'complete';

const INTRO_SESSION_KEY = 'fyp_intro_seen';
const INTRO_SAFETY_TIMEOUT_MS = 7000;

async function fetchRegistrationPolicy(): Promise<RegistrationPolicyDto | null> {
  try {
    const response = await fetch('/api/registration-policy');
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error('Unable to load registration policy:', error);
    return null;
  }
}

const PORTAL_THEME = {
  name: 'Professional',
  bg: 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]',
  text: 'text-[var(--color-accent)]',
  ring: 'focus:ring-[var(--color-accent)]/30',
  lightBg: 'bg-[var(--color-accent-soft)]',
  gradient: '',
  border: 'border-[var(--color-accent)]',
};

// --- MAIN APP ---
export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [supervisorsList, setSupervisorsList] = useState<RegistrationSupervisor[]>([]);
  const [registrationPolicy, setRegistrationPolicy] = useState<RegistrationPolicyDto>(
    DEFAULT_REGISTRATION_POLICY
  );
  const [isClient, setIsClient] = useState(false);
  const [introState, setIntroState] = useState<IntroState>('checking');
  const [dialog, setDialog] = useState<PortalDialogState>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    onConfirm: () => {},
    defaultValue: '',
    inputType: 'text',
    inputOptions: [],
    placeholder: '',
    instanceId: 0,
  });

  const { data: session, status } = useSession();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsClient(true);
      try {
        setIsDarkMode(localStorage.getItem('fyp_theme') === 'dark');
      } catch {
        // The default light theme remains usable when browser storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    const timer = window.setTimeout(() => {
      if (status === 'authenticated') {
        setIntroState('complete');
        return;
      }
      if (status !== 'unauthenticated' || introState !== 'checking') return;

      try {
        if (sessionStorage.getItem(INTRO_SESSION_KEY) === '1') {
          setIntroState('complete');
        } else {
          sessionStorage.setItem(INTRO_SESSION_KEY, '1');
          setIntroState('showing');
        }
      } catch {
        setIntroState('showing');
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [introState, isClient, status]);

  useEffect(() => {
    if (!isClient) return;

    try {
      localStorage.setItem('fyp_theme', isDarkMode ? 'dark' : 'light');
    } catch {
      // Theme preference persistence is optional.
    }
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light';
  }, [isClient, isDarkMode]);

  const handleIntroComplete = useCallback(() => {
    setIntroState('complete');
  }, []);

  useEffect(() => {
    if (introState !== 'showing') return;

    // Safety net: authentication must never remain blocked by a stalled animation.
    const safetyTimer = window.setTimeout(() => {
      setIntroState('complete');
    }, INTRO_SAFETY_TIMEOUT_MS);

    return () => window.clearTimeout(safetyTimer);
  }, [introState]);

  // ✅ useCallback - stable function references
  const showDialog = useCallback(({ type = 'alert', title, message, onConfirm = () => {}, defaultValue = '', inputType = 'text', inputOptions = [], placeholder = '' }: DialogOptions) => {
    setDialog((previous) => ({
      isOpen: true,
      type,
      title,
      message,
      onConfirm,
      defaultValue,
      inputType,
      inputOptions,
      placeholder,
      instanceId: previous.instanceId + 1,
    }));
  }, []);

    const closeDialog = useCallback(() => setDialog(prev => ({ ...prev, isOpen: false })), []);

  const loadRegistrationPolicy = useCallback(async (): Promise<RegistrationPolicyDto | null> => {
    const nextPolicy = await fetchRegistrationPolicy();
    if (nextPolicy) setRegistrationPolicy(nextPolicy);
    return nextPolicy;
  }, []);

  useEffect(() => {
    void fetchRegistrationPolicy().then((nextPolicy) => {
      if (nextPolicy) setRegistrationPolicy(nextPolicy);
    });
    const handleFocus = () => void loadRegistrationPolicy();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadRegistrationPolicy]);

  useEffect(() => {
    if (isRegistering && registrationPolicy.isOpen) {
      fetch('/api/supervisors').then(res => res.json()).then(data => setSupervisorsList(Array.isArray(data) ? data : [])).catch(console.error);
    }
  }, [isRegistering, registrationPolicy.isOpen]);

  // ✅ useCallback - only recreated when dependencies change
  const renderView = useCallback(() => {
    if (status === "authenticated" && session?.user) {
  const role = (session.user as { role?: string }).role;

  if (role === 'admin') {
          return (
        <AdminDashboard
          isDarkMode={isDarkMode}
          theme={PORTAL_THEME}
          session={session}
          showDialog={showDialog}
          registrationPolicy={registrationPolicy}
          onRegistrationPolicyChange={setRegistrationPolicy}
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
        onBack={() => setIsRegistering(false)}
        supervisorsList={supervisorsList}
        showDialog={showDialog}
        registrationPolicy={registrationPolicy}
        refreshRegistrationPolicy={loadRegistrationPolicy}
      />
    ) : (
      <LoginView
        onRegister={() => setIsRegistering(true)}
        showDialog={showDialog}
      />
    );
  }, [status, session, isDarkMode, isRegistering, supervisorsList, showDialog, registrationPolicy, loadRegistrationPolicy]);

  if (!isClient || status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
        <Loader2 className="animate-spin text-[var(--color-accent)]" size={40} />
      </div>
    );
  }

  if (status === 'unauthenticated' && introState !== 'complete') {
    return introState === 'showing' ? (
      <SessionIntro onComplete={handleIntroComplete} />
    ) : (
      <div
        className="min-h-screen bg-black"
        aria-busy="true"
        aria-label="Preparing FYP Management System"
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] transition-colors">
      <PortalDialog key={dialog.instanceId} dialog={dialog} closeDialog={closeDialog} />

      <nav className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex w-full items-center justify-between px-4 py-3 md:w-[90vw] md:px-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
              <Image src="/logo.png" alt="University Logo" width={40} height={40} className="h-full w-full object-contain p-1" />
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


