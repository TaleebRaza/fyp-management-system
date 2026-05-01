"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession, signIn, signOut } from "next-auth/react";
import dynamic from 'next/dynamic';
import { User, Lock, Moon, Sun, ArrowRight, UserPlus, LogIn, LayoutDashboard, Users, PlusCircle, Code, FileText, Upload, CheckCircle, XCircle, Send, ArrowRightLeft, Loader2, Palette, Trash2, UserMinus, Globe, Wrench, ChevronRight, AlertTriangle, Download, Mail, MailX } from 'lucide-react';
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

type ThemeKey = 'ocean' | 'fiery' | 'zen';

// --- PREMIUM ACCENT THEMES ---
const getTheme = (key: ThemeKey, isDark: boolean) => {
  const themes = {
    ocean: { name: 'Ocean', bg: 'bg-blue-500 hover:bg-blue-600', text: 'text-blue-500', ring: 'focus:ring-blue-500/50', lightBg: isDark ? 'bg-blue-500/10' : 'bg-blue-50', gradient: 'from-blue-500 to-cyan-500', border: 'border-blue-500' },
    fiery: { name: 'Fiery', bg: 'bg-orange-500 hover:bg-orange-600', text: 'text-orange-500', ring: 'focus:ring-orange-500/50', lightBg: isDark ? 'bg-orange-500/10' : 'bg-orange-50', gradient: 'from-orange-500 to-red-500', border: 'border-orange-500' },
    zen: { name: 'Zen', bg: 'bg-emerald-500 hover:bg-emerald-600', text: 'text-emerald-500', ring: 'focus:ring-emerald-500/50', lightBg: isDark ? 'bg-emerald-500/10' : 'bg-emerald-50', gradient: 'from-emerald-500 to-teal-500', border: 'border-emerald-500' },
  };
  return themes[key];
};

const DialogModal = ({ dialog, closeDialog, isDarkMode, theme }: any) => {
  const [inputValue, setInputValue] = useState(dialog.defaultValue);
  useEffect(() => { if (dialog.isOpen) setInputValue(dialog.defaultValue); }, [dialog.isOpen, dialog.defaultValue]);

  return (
    <AnimatePresence>
      {dialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={closeDialog} />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={`relative w-full max-w-md p-8 rounded-[2rem] border shadow-2xl backdrop-blur-3xl ${isDarkMode ? 'bg-[#18181b]/95 border-white/10 text-white' : 'bg-white/95 border-neutral-200/50 text-black'}`}
          >
            <div className={`w-14 h-14 rounded-2xl mb-6 flex items-center justify-center ${dialog.type === 'confirm' ? 'bg-red-500/10 text-red-500' : `${theme.lightBg} ${theme.text}`} shadow-sm`}>
              {dialog.type === 'prompt' ? <FileText size={28} /> : (dialog.type === 'confirm' || dialog.title.includes("Error") || dialog.title.includes("Required") ? <XCircle size={28} className={dialog.title.includes("Required") ? "text-amber-500" : ""} /> : <CheckCircle size={28} />)}
            </div>
            
            <h3 className="text-2xl font-extrabold tracking-tight mb-2">{dialog.title}</h3>
            <p className="opacity-70 mb-6 font-medium leading-relaxed">{dialog.message}</p>

            {dialog.type === 'prompt' && (
              <textarea autoFocus value={inputValue} onChange={(e: any) => setInputValue(e.target.value)} placeholder="E.g., Great methodology, but needs more citations..." rows={4}
                className={`w-full px-5 py-4 rounded-2xl border-2 border-transparent transition-all duration-300 outline-none resize-none mb-2 text-sm shadow-inner ${isDarkMode ? 'bg-neutral-900 text-white placeholder-neutral-500' : 'bg-neutral-100/70 text-black placeholder-neutral-400'} ${theme.ring} focus:bg-transparent`} 
              />
            )}

            <div className="flex justify-end gap-3 mt-8">
              {(dialog.type === 'prompt' || dialog.type === 'confirm') && (
                <button onClick={closeDialog} className={`px-6 py-3 rounded-xl font-bold transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-300' : 'hover:bg-neutral-200 text-neutral-600'}`}>Cancel</button>
              )}
              <button onClick={() => { dialog.onConfirm(inputValue); closeDialog(); }} className={`px-8 py-3 rounded-xl text-white font-bold transition-transform active:scale-95 shadow-lg ${dialog.type === 'confirm' ? 'bg-red-500 hover:bg-red-600' : theme.bg}`}>
                {dialog.type === 'prompt' ? 'Confirm' : (dialog.type === 'confirm' ? 'Yes, Proceed' : 'Okay')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// --- AUTH VIEWS ---
const LoginView = ({ isDarkMode, theme, setIsRegistering, showDialog }: any) => {
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetRollNo, setResetRollNo] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: any) => {
    e.preventDefault(); 
    const result = await signIn("credentials", { redirect: false, rollNo: e.target.rollNo.value, password: e.target.password.value });
    if (result?.error) showDialog({ title: "Login Failed", message: result.error });
  };

  const handleRequestCode = async (e: any) => {
    e.preventDefault();
    setIsLoading(true);
    const res = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rollNo: resetRollNo }) });
    const data = await res.json();
    setIsLoading(false);
    if (res.ok) { setResetStep(2); showDialog({ title: "Check Inbox", message: data.message }); }
    else showDialog({ title: "Error", message: data.error });
  };

  const handleResetPassword = async (e: any) => {
    e.preventDefault();
    setIsLoading(true);
    const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rollNo: resetRollNo, code: resetCode, newPassword }) });
    const data = await res.json();
    setIsLoading(false);
    if (res.ok) { setIsResetMode(false); setResetStep(1); showDialog({ title: "Success", message: data.message }); }
    else showDialog({ title: "Error", message: data.error });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center justify-center min-h-[80vh]">
      <GlassCard isDarkMode={isDarkMode} className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className={`${theme.bg} p-4 rounded-2xl shadow-lg shadow-${theme.text}/20 transition-colors duration-500`}>
            {isResetMode ? <Lock className="text-white" size={32} /> : <LogIn className="text-white" size={32} />}
          </div>
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-center mb-8">
          {isResetMode ? "Reset Password" : "Portal Login"}
        </h2>

        {isResetMode ? (
          resetStep === 1 ? (
            <form onSubmit={handleRequestCode} className="flex flex-col gap-5 relative z-10">
              <div>
                <label className="block text-sm font-medium mb-1 opacity-80 pl-1">Roll No / ID</label>
                <StyledInput isDarkMode={isDarkMode} theme={theme} value={resetRollNo} onChange={(e:any) => setResetRollNo(e.target.value)} required placeholder="e.g. FA20-BCS-001" />
              </div>
              <button disabled={isLoading} type="submit" className={`w-full py-4 mt-2 rounded-2xl font-bold text-white transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 ${theme.bg}`}>
                {isLoading ? <Loader2 className="animate-spin mx-auto" /> : 'Send Reset Code'}
              </button>
              <button type="button" onClick={() => setIsResetMode(false)} className="text-sm opacity-60 hover:opacity-100 font-medium">Back to Login</button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="flex flex-col gap-5 relative z-10">
              <div>
                <label className="block text-sm font-medium mb-1 opacity-80 pl-1">6-Digit Code</label>
                <StyledInput isDarkMode={isDarkMode} theme={theme} value={resetCode} onChange={(e:any) => setResetCode(e.target.value)} required placeholder="123456" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 opacity-80 pl-1">New Password</label>
                <StyledInput isDarkMode={isDarkMode} theme={theme} type="password" value={newPassword} onChange={(e:any) => setNewPassword(e.target.value)} required placeholder="••••••••" />
              </div>
              <button disabled={isLoading} type="submit" className={`w-full py-4 mt-2 rounded-2xl font-bold text-white transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 ${theme.bg}`}>
                {isLoading ? <Loader2 className="animate-spin mx-auto" /> : 'Update Password'}
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handleLogin} className="flex flex-col gap-5 relative z-10">
            <div><label className="block text-sm font-medium mb-2 opacity-80 pl-1">Roll No / Username</label><StyledInput isDarkMode={isDarkMode} theme={theme} icon={User} name="rollNo" type="text" required placeholder="Enter your ID" /></div>
            <div><label className="block text-sm font-medium mb-2 opacity-80 pl-1">Password</label><StyledInput isDarkMode={isDarkMode} theme={theme} icon={Lock} name="password" type="password" required placeholder="••••••••" /></div>
            <div className="text-right">
              <button type="button" onClick={() => setIsResetMode(true)} className={`text-sm font-bold ${theme.text} hover:underline`}>Forgot Password?</button>
            </div>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" className={`w-full ${theme.bg} text-white font-bold py-4 rounded-2xl transition-colors duration-500 flex items-center justify-center gap-2 mt-4 shadow-lg`}>Sign In <ArrowRight size={20} /></motion.button>
          </form>
        )}

        <p className="mt-8 text-center text-sm font-medium opacity-75">New Student? <button onClick={() => setIsRegistering(true)} className={`${theme.text} hover:underline transition-colors duration-300`}>Register Here</button></p>
      </GlassCard>
    </motion.div>
  );
};

const RegisterView = ({ isDarkMode, theme, setIsRegistering, supervisorsList, showDialog }: any) => {
  const [program, setProgram] = useState('BSCS');

  const handleRegister = async (e: any) => {
    e.preventDefault();
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: e.target.name.value,
        email: e.target.email.value,
        rollNo: e.target.rollNo.value,
        password: e.target.password.value,
        supervisorId: e.target.supervisor.value,
        program,
      })
    });
    const data = await res.json();
    if (res.ok) {
      showDialog({ title: "Welcome!", message: "Registration Successful! Please log in." });
      setIsRegistering(false);
    } else {
      showDialog({ title: "Registration Error", message: data.error || "Registration failed" });
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center justify-center min-h-[80vh]">
      <GlassCard isDarkMode={isDarkMode} className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className={`${theme.bg} p-4 rounded-2xl shadow-lg transition-colors duration-500`}>
            <UserPlus className="text-white" size={32} />
          </div>
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-center mb-8">Create Account</h2>
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 opacity-80 pl-1">Full Name</label>
            <StyledInput isDarkMode={isDarkMode} theme={theme} name="name" type="text" required placeholder="John Doe" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 opacity-80 pl-1">Email Address</label>
            <StyledInput isDarkMode={isDarkMode} theme={theme} name="email" type="email" required placeholder="student@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 opacity-80 pl-1">Roll Number</label>
            <StyledInput isDarkMode={isDarkMode} theme={theme} name="rollNo" type="text" required placeholder="e.g. FA20-BCS-001" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 opacity-80 pl-1">Password</label>
            <StyledInput isDarkMode={isDarkMode} theme={theme} name="password" type="password" required placeholder="••••••••" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.keys(PROGRAM_MAP).map(prog => (
              <label 
                key={prog} 
                title={PROGRAM_MAP[prog]}
                className={`flex items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all duration-300 select-none ${program === prog ? `${theme.border} ${theme.lightBg} ${theme.text}` : `border-transparent ${isDarkMode ? 'bg-neutral-800' : 'bg-neutral-100/70'} opacity-70 hover:opacity-100`}`}
              >
                <input type="radio" name="program" value={prog} checked={program === prog} onChange={(e) => setProgram(e.target.value)} className="hidden" />
                <span className="font-bold text-sm tracking-wide">{prog}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 opacity-80 pl-1">Select Supervisor</label>
            <div className="relative group">
              <select
                name="supervisor"
                className={`w-full pl-4 pr-10 py-3.5 rounded-2xl border-2 border-transparent transition-all duration-300 outline-none appearance-none ${
                  isDarkMode ? 'bg-neutral-800 text-white' : 'bg-neutral-100/70 text-black'
                } ${theme.ring} focus:bg-transparent`}
              >
                <option value="">-- Optional (Choose Later) --</option>
                {Array.isArray(supervisorsList) &&
                  supervisorsList.map((sup: any) => (
                    <option key={sup._id} value={sup._id} disabled={sup.isFull}>
                      {sup.name} {sup.isFull ? '(Capacity Reached)' : `(${sup.filledSlots}/${sup.maxSlots} Slots)`}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            className={`w-full ${theme.bg} text-white font-bold py-4 rounded-2xl transition-colors duration-500 mt-6 shadow-lg`}
          >
            Register Now
          </motion.button>
        </form>
        <p className="mt-8 text-center text-sm font-medium opacity-75">
          Already have an account?{' '}
          <button onClick={() => setIsRegistering(false)} className={`${theme.text} hover:underline transition-colors duration-300`}>
            Log In
          </button>
        </p>
      </GlassCard>
    </motion.div>
  );
};

// --- MAIN APP ---
export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [supervisorsList, setSupervisorsList] = useState<any[]>([]);
  const [activeAccent, setActiveAccent] = useState<ThemeKey>('ocean');
  const [isMounted, setIsMounted] = useState(false);
  const [enableTransition, setEnableTransition] = useState(false);
  const [dialog, setDialog] = useState({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: (val?: string) => {}, defaultValue: '' });

  const { data: session, status } = useSession();

  // ✅ useMemo - only recalculates when accent or dark mode changes
  const theme = useMemo(() => getTheme(activeAccent, isDarkMode), [activeAccent, isDarkMode]);

  useEffect(() => {
    setIsMounted(true);
    const savedTheme = localStorage.getItem('fyp_theme');
    const savedAccent = localStorage.getItem('fyp_accent') as ThemeKey;
    if (savedTheme === 'dark') setIsDarkMode(true);
    if (savedAccent) setActiveAccent(savedAccent);
    setTimeout(() => setEnableTransition(true), 50);
  }, []);

  useEffect(() => { if (isMounted) localStorage.setItem('fyp_theme', isDarkMode ? 'dark' : 'light'); }, [isDarkMode, isMounted]);
  useEffect(() => { if (isMounted) localStorage.setItem('fyp_accent', activeAccent); }, [activeAccent, isMounted]);

  // ✅ useCallback - stable function references
  const showDialog = useCallback(({ type = 'alert', title, message, onConfirm = () => {}, defaultValue = '' }: any) => {
    setDialog({ isOpen: true, type, title, message, onConfirm, defaultValue });
  }, []);

  const closeDialog = useCallback(() => setDialog(prev => ({ ...prev, isOpen: false })), []);

  const cycleTheme = useCallback(() => {
    const keys: ThemeKey[] = ['ocean', 'fiery', 'zen'];
    setActiveAccent(keys[(keys.indexOf(activeAccent) + 1) % keys.length]);
  }, [activeAccent]);

  useEffect(() => {
    if (isRegistering) fetch('/api/supervisors').then(res => res.json()).then(data => setSupervisorsList(Array.isArray(data) ? data : [])).catch(console.error);
  }, [isRegistering]);

  // ✅ useCallback - only recreated when dependencies change
  const renderView = useCallback(() => {
    if (!isMounted) return <div className="min-h-screen"></div>;
    if (status === "loading") return <div className="flex justify-center items-center min-h-[80vh]"><Loader2 className={`animate-spin ${theme.text}`} size={40}/></div>;
    
    if (status === "authenticated" && session?.user) {
      const role = (session.user as any).role;
      if (role === 'admin') return <AdminDashboard isDarkMode={isDarkMode} theme={theme} session={session} showDialog={showDialog} />;
      if (role === 'supervisor') return <SupervisorDashboard isDarkMode={isDarkMode} theme={theme} session={session} showDialog={showDialog} />;
      if (role === 'student') return <StudentDashboard isDarkMode={isDarkMode} theme={theme} session={session} showDialog={showDialog} />;
    }
    
    return isRegistering 
      ? <RegisterView isDarkMode={isDarkMode} theme={theme} setIsRegistering={setIsRegistering} supervisorsList={supervisorsList} showDialog={showDialog} /> 
      : <LoginView isDarkMode={isDarkMode} theme={theme} setIsRegistering={setIsRegistering} showDialog={showDialog} />;
  }, [isMounted, status, session, isDarkMode, theme, isRegistering, supervisorsList, showDialog]);

  return (
    <div className={`min-h-screen ${enableTransition ? 'transition-colors duration-700' : ''} ${isDarkMode ? 'bg-[#0a0a0a] text-white' : 'bg-neutral-50 text-black'}`}>
      <DialogModal dialog={dialog} closeDialog={closeDialog} isDarkMode={isDarkMode} theme={theme} />
      
      <nav className={`sticky top-0 z-50 p-4 border-b ${enableTransition ? 'transition-colors duration-700' : ''} backdrop-blur-2xl shadow-sm ${isDarkMode ? 'bg-[#0a0a0a]/70 border-white/5' : 'bg-white/70 border-neutral-200/50'}`}>
        <div className="container mx-auto max-w-7xl flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${theme.gradient} flex items-center justify-center shadow-lg shadow-${theme.text}/20 transition-all duration-500`}><LayoutDashboard className="text-white" size={20}/></div>
            <h1 className={`text-xl font-black tracking-tighter hidden sm:block ${isDarkMode ? 'text-white' : 'text-black'}`}>FYP <span className={`transition-colors duration-500 ${theme.text}`}>Portal</span></h1>
          </div>
          
          <div className={`flex items-center gap-2 p-1.5 rounded-2xl border ${isDarkMode ? 'bg-neutral-800/50 border-neutral-700/30' : 'bg-neutral-200/50 border-neutral-300/30'}`}>
            <button onClick={cycleTheme} className={`p-2.5 rounded-xl transition-all duration-300 shadow-sm hover:shadow group ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-white'}`} title={`Current Theme: ${theme.name}`}><Palette size={20} className={`transition-colors duration-500 ${theme.text}`} /></button>
            <div className={`w-px h-6 mx-1 ${isDarkMode ? 'bg-neutral-700' : 'bg-neutral-300'}`}></div>
            <button onClick={() => setIsDarkMode(!isDarkMode)} className={`p-2.5 rounded-xl transition-all duration-300 shadow-sm hover:shadow ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-white'}`}>{isDarkMode ? <Sun size={20} className="text-amber-400" /> : <Moon size={20} className="text-neutral-600" />}</button>
          </div>
        </div>
      </nav>
      <main className="container mx-auto p-4 md:p-8 max-w-7xl mt-4"><AnimatePresence mode="wait">{renderView()}</AnimatePresence></main>
    </div>
  );
}