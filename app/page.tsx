"use client";

import React, { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from "next-auth/react";
import { User, Lock, Moon, Sun, ArrowRight, UserPlus, LogIn, LayoutDashboard, Users, PlusCircle, Code, FileText, Upload, CheckCircle, XCircle, Send, ArrowRightLeft, Loader2, Palette, Trash2, UserMinus, Globe, Wrench, ChevronRight, AlertTriangle,Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';


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

// --- REUSABLE UI COMPONENTS ---
const GlassCard = ({ children, className = "", isDarkMode }: any) => (
  <div className={`p-8 rounded-[2rem] border backdrop-blur-2xl transition-all duration-500 ${isDarkMode ? 'bg-neutral-900/80 border-white/5 shadow-[0_8px_30px_rgb(0,0,0,0.1)]' : 'bg-white/80 border-neutral-200/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'} ${className}`}>
    {children}
  </div>
);

const StyledInput = ({ icon: Icon, isDarkMode, theme, disabled, ...props }: any) => (
  <div className="relative group">
    {Icon && <Icon className={`absolute left-4 top-3.5 transition-colors duration-300 ${disabled ? 'opacity-30' : (isDarkMode ? 'text-neutral-500 group-focus-within:text-white' : 'text-neutral-400 group-focus-within:text-black')}`} size={20} />}
    <input 
      disabled={disabled}
      className={`w-full ${Icon ? 'pl-12' : 'pl-4'} pr-4 py-3.5 rounded-2xl border-2 border-transparent transition-all duration-300 outline-none 
      ${isDarkMode ? 'bg-neutral-800 text-white placeholder-neutral-500' : 'bg-neutral-100/70 text-black placeholder-neutral-400'} 
      ${disabled ? 'opacity-50 cursor-not-allowed' : `${theme.ring} focus:bg-transparent`}`} 
      {...props} 
    />
  </div>
);

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
  const handleLogin = async (e: any) => {
    e.preventDefault(); 
    const result = await signIn("credentials", { redirect: false, rollNo: e.target.rollNo.value, password: e.target.password.value });
    if (result?.error) showDialog({ title: "Login Failed", message: "Invalid Roll No or Password!" });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center justify-center min-h-[80vh]">
      <GlassCard isDarkMode={isDarkMode} className="w-full max-w-md">
        <div className="flex justify-center mb-8"><div className={`${theme.bg} p-4 rounded-2xl shadow-lg shadow-${theme.text}/20 transition-colors duration-500`}><LogIn className="text-white" size={32} /></div></div>
        <h2 className="text-3xl font-extrabold tracking-tight text-center mb-8">Portal Login</h2>
        <form onSubmit={handleLogin} className="space-y-5">
          <div><label className="block text-sm font-medium mb-2 opacity-80 pl-1">Roll No / Username</label><StyledInput isDarkMode={isDarkMode} theme={theme} icon={User} name="rollNo" type="text" required placeholder="Enter your ID" /></div>
          <div><label className="block text-sm font-medium mb-2 opacity-80 pl-1">Password</label><StyledInput isDarkMode={isDarkMode} theme={theme} icon={Lock} name="password" type="password" required placeholder="••••••••" /></div>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" className={`w-full ${theme.bg} text-white font-bold py-4 rounded-2xl transition-colors duration-500 flex items-center justify-center gap-2 mt-4 shadow-lg`}>Sign In <ArrowRight size={20} /></motion.button>
        </form>
        <p className="mt-8 text-center text-sm font-medium opacity-75">New Student? <button onClick={() => setIsRegistering(true)} className={`${theme.text} hover:underline transition-colors duration-300`}>Register Here</button></p>
      </GlassCard>
    </motion.div>
  );
};

const RegisterView = ({ isDarkMode, theme, setIsRegistering, supervisorsList, showDialog }: any) => {
  const handleRegister = async (e: any) => {
    e.preventDefault();
    const res = await fetch('/api/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: e.target.name.value, rollNo: e.target.rollNo.value, password: e.target.password.value, supervisorId: e.target.supervisor.value })
    });
    const data = await res.json();
    if (res.ok) { showDialog({ title: "Welcome!", message: "Registration Successful! Please log in." }); setIsRegistering(false); } 
    else { showDialog({ title: "Registration Error", message: data.error || "Registration failed" }); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center justify-center min-h-[80vh]">
      <GlassCard isDarkMode={isDarkMode} className="w-full max-w-md">
        <div className="flex justify-center mb-8"><div className={`${theme.bg} p-4 rounded-2xl shadow-lg transition-colors duration-500`}><UserPlus className="text-white" size={32} /></div></div>
        <h2 className="text-3xl font-extrabold tracking-tight text-center mb-8">Create Account</h2>
        <form onSubmit={handleRegister} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1 opacity-80 pl-1">Full Name</label><StyledInput isDarkMode={isDarkMode} theme={theme} name="name" type="text" required placeholder="John Doe" /></div>
          <div><label className="block text-sm font-medium mb-1 opacity-80 pl-1">Roll Number</label><StyledInput isDarkMode={isDarkMode} theme={theme} name="rollNo" type="text" required placeholder="e.g. FA20-BCS-001" /></div>
          <div><label className="block text-sm font-medium mb-1 opacity-80 pl-1">Password</label><StyledInput isDarkMode={isDarkMode} theme={theme} name="password" type="password" required placeholder="••••••••" /></div>
          <div>
            <label className="block text-sm font-medium mb-1 opacity-80 pl-1">Select Supervisor</label>
            <div className="relative group">
              <select name="supervisor" className={`w-full pl-4 pr-10 py-3.5 rounded-2xl border-2 border-transparent transition-all duration-300 outline-none appearance-none ${isDarkMode ? 'bg-neutral-800 text-white' : 'bg-neutral-100/70 text-black'} ${theme.ring} focus:bg-transparent`}>
                <option value="">-- Optional (Choose Later) --</option>
                {Array.isArray(supervisorsList) && supervisorsList.map((sup: any) => <option key={sup._id} value={sup._id}>{sup.name}</option>)}
              </select>
            </div>
          </div>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" className={`w-full ${theme.bg} text-white font-bold py-4 rounded-2xl transition-colors duration-500 mt-6 shadow-lg`}>Register Now</motion.button>
        </form>
        <p className="mt-8 text-center text-sm font-medium opacity-75">Already have an account? <button onClick={() => setIsRegistering(false)} className={`${theme.text} hover:underline transition-colors duration-300`}>Log In</button></p>
      </GlassCard>
    </motion.div>
  );
};

// --- DASHBOARDS ---
const AdminDashboard = ({ isDarkMode, theme, session, showDialog }: any) => {
  const [newSupName, setNewSupName] = useState('');
  const [newSupRollNo, setNewSupRollNo] = useState('');
  const [newSupPassword, setNewSupPassword] = useState('');
  const [adminSupervisors, setAdminSupervisors] = useState<any[]>([]);

  const fetchSupervisors = () => fetch('/api/supervisors').then(res => res.json()).then(data => setAdminSupervisors(Array.isArray(data) ? data : [])).catch(console.error);
  useEffect(() => { fetchSupervisors(); }, []);

  const handleAddSupervisor = async (e: any) => {
    e.preventDefault();
    const res = await fetch('/api/add-supervisor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSupName, rollNo: newSupRollNo, password: newSupPassword, migrationCode: Math.random().toString(36).substring(2, 8).toUpperCase() })
    });
    if (res.ok) { showDialog({ title: "Success", message: `Supervisor ${newSupName} added!` }); setNewSupName(''); setNewSupRollNo(''); setNewSupPassword(''); fetchSupervisors(); } 
    else showDialog({ title: "Error", message: "Failed to add supervisor" });
  };

  const handleDeleteSupervisor = (id: string, name: string) => {
    showDialog({
      type: 'confirm', title: 'Delete Supervisor?', message: `Are you sure you want to permanently delete ${name}? All their assigned students will be marked as "Unassigned".`,
      onConfirm: async () => {
        const res = await fetch('/api/delete-supervisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        if (res.ok) fetchSupervisors(); else showDialog({ title: "Error", message: "Failed to delete." });
      }
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col md:flex-row gap-6 min-h-[80vh]">
      <GlassCard isDarkMode={isDarkMode} className="w-full md:w-72 flex flex-col p-6">
        <h3 className="text-xl font-extrabold mb-8 flex items-center gap-3 tracking-tight"><div className={`p-2 rounded-xl ${theme.lightBg} ${theme.text} transition-colors duration-500`}><LayoutDashboard size={20} /></div> Admin Panel</h3>
        <ul className="space-y-3 flex-1"><li className={`flex items-center gap-3 font-semibold p-4 rounded-2xl cursor-pointer transition-all duration-300 ${theme.lightBg} ${theme.text}`}><Users size={20} /> Supervisors</li></ul>
        <div className={`mt-auto pt-6 border-t ${isDarkMode ? 'border-neutral-800' : 'border-neutral-200'}`}>
          <p className="text-sm font-bold opacity-60 mb-3 ml-1">{session?.user?.name}</p>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => signOut({ redirect: false })} className={`w-full bg-red-500/10 hover:bg-red-500 ${isDarkMode ? 'text-red-400' : 'text-red-600'} hover:text-white py-3 rounded-2xl transition-colors font-bold flex items-center justify-center gap-2`}><LogIn size={20} className="rotate-180" /> Logout</motion.button>
        </div>
      </GlassCard>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard isDarkMode={isDarkMode} className="col-span-1 flex flex-col justify-between p-8">
           <div>
             <h4 className="text-lg font-extrabold tracking-tight mb-6 flex items-center gap-2"><PlusCircle size={20} className={theme.text} /> Add Supervisor</h4>
             <form onSubmit={handleAddSupervisor} className="space-y-5">
               <div><StyledInput isDarkMode={isDarkMode} theme={theme} value={newSupName} onChange={(e:any) => setNewSupName(e.target.value)} type="text" required placeholder="Full Name" /></div>
               <div><StyledInput isDarkMode={isDarkMode} theme={theme} value={newSupRollNo} onChange={(e:any) => setNewSupRollNo(e.target.value)} type="text" required placeholder="Username ID" /></div>
               <div><StyledInput isDarkMode={isDarkMode} theme={theme} value={newSupPassword} onChange={(e:any) => setNewSupPassword(e.target.value)} type="text" required placeholder="Assign Password" /></div>
               <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" className={`w-full ${theme.bg} text-white font-bold py-3.5 rounded-2xl transition-colors duration-500 mt-2 shadow-lg`}>Create Account</motion.button>
             </form>
           </div>
        </GlassCard>

        <GlassCard isDarkMode={isDarkMode} className="col-span-1 lg:col-span-2 p-8 flex flex-col">
          <h4 className="text-lg font-extrabold tracking-tight mb-6">Active Supervisors <span className={`text-sm font-medium px-2 py-1 rounded-lg ml-2 ${theme.lightBg} ${theme.text}`}>{adminSupervisors.length}</span></h4>
          <div className="space-y-3 overflow-y-auto pr-2 flex-1">
            <AnimatePresence>
              {adminSupervisors.map(sup => (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} key={sup._id} className={`p-4 rounded-2xl flex justify-between items-center border transition-all duration-300 hover:scale-[1.01] ${isDarkMode ? 'border-neutral-800 bg-neutral-800/50' : 'border-neutral-100 bg-neutral-50/50'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold shadow-md bg-gradient-to-br ${theme.gradient} transition-colors duration-500`}>{sup.name.charAt(0)}</div>
                    <div><p className="font-bold text-lg tracking-tight">{sup.name}</p><p className="text-sm font-medium opacity-60">ID: {sup.rollNo}</p></div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider opacity-40 mb-1">Code</p>
                      <span className={`text-sm font-mono px-3 py-1.5 rounded-xl flex items-center gap-2 border transition-colors duration-500 ${theme.lightBg} ${theme.text} ${isDarkMode ? 'border-white/5' : 'border-black/5'}`}><Code size={14} /> {sup.migrationCode}</span>
                    </div>
                    <button onClick={() => handleDeleteSupervisor(sup._id, sup.name)} className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors mt-4"><Trash2 size={18} /></button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </GlassCard>
      </div>
    </motion.div>
  );
};

const SupervisorDashboard = ({ isDarkMode, theme, session, showDialog }: any) => {
  const [myStudents, setMyStudents] = useState<any[]>([]);
  const [migrationInput, setMigrationInput] = useState<Record<string, string>>({});
  const [myMigrationCode, setMyMigrationCode] = useState<string>("Loading...");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);

  const fetchStudents = async () => {
    const res = await fetch(`/api/dashboard/supervisor?id=${(session?.user as any)?.id}`);
    const json = await res.json();
    setMyStudents(Array.isArray(json.students) ? json.students : []);
    try {
      const supRes = await fetch('/api/supervisors');
      const supData = await supRes.json();
      const sups = Array.isArray(supData) ? supData : [];
      const me = sups.find((s: any) => s.rollNo === (session?.user as any)?.rollNo);
      if (me) setMyMigrationCode(me.migrationCode || "N/A");
    } catch (err) { setMyMigrationCode("Error"); }
    setIsLoading(false);
  };
  useEffect(() => { fetchStudents(); }, []);

  const handleAction = async (studentId: string, newStatus: string) => {
    showDialog({
      type: 'prompt', title: `${newStatus} Project`, message: `Add optional remarks for marking this project as ${newStatus}:`,
      onConfirm: async (remarks: string) => {
        await fetch('/api/dashboard/supervisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'updateStatus', studentId, status: newStatus, remarks: remarks || "No remarks provided." }) });
        setSelectedStudent(null); fetchStudents(); 
      }
    });
  };

  const handleMigrate = async (studentId: string) => {
    const code = migrationInput[studentId];
    if (!code) { showDialog({ title: "Input Required", message: "Please enter a Migration Code." }); return; }
    const res = await fetch('/api/dashboard/supervisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'migrate', studentId, migrationCode: code }) });
    if (res.ok) { showDialog({ title: "Success", message: "Student migrated!" }); setSelectedStudent(null); fetchStudents(); } 
    else { showDialog({ title: "Error", message: "Invalid Migration Code." }); }
  };

  const handleRemoveStudent = (studentId: string, name: string) => {
    showDialog({
      type: 'confirm', title: 'Remove Student?', message: `Are you sure you want to remove ${name} from your list? They will have to select a new supervisor.`,
      onConfirm: async () => {
        await fetch('/api/dashboard/supervisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'removeStudent', studentId }) });
        setSelectedStudent(null); fetchStudents();
      }
    });
  };

  // ── UPDATED: opens report in new tab, browser print dialog saves as PDF ──
 const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const id   = (session?.user as any)?.id;
      const name = session?.user?.name || 'Supervisor';
      
      // Keeps the exact same API route
      const response = await fetch(`/api/export-pdf?id=${id}&name=${encodeURIComponent(name)}`);
      
      if (!response.ok) {
        throw new Error(`Export failed. Server responded with status: ${response.status}`);
      }
      
      const blob = await response.blob();
      
      // Failsafe check
      if (blob.size === 0) {
        throw new Error('Received an empty file from the server.');
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // CHANGED HERE: We just save the incoming blob as an .xlsx file instead of .pdf
      a.download = `fyp-report-${name.replace(/\s+/g, '-')}.xlsx`; 
      
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (err: any) {
      console.error("Export Download Error:", err);
      showDialog({ title: 'Export Failed', message: err.message || 'An unexpected error occurred.' });
    } finally {
      setTimeout(() => setIsExporting(false), 1000);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-[80vh]"><Loader2 className={`animate-spin ${theme.text}`} size={40}/></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6 min-h-[80vh] relative">
      <AnimatePresence>
        {selectedStudent && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedStudent(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 rounded-[2rem] border shadow-2xl backdrop-blur-3xl custom-scrollbar ${isDarkMode ? 'bg-[#18181b]/95 border-white/10 text-white' : 'bg-white/95 border-neutral-200/50 text-black'}`}
            >
              <button onClick={() => setSelectedStudent(null)} className="absolute top-6 right-6 p-2 rounded-full hover:bg-neutral-500/20 transition-colors z-10"><XCircle size={24} className="opacity-60" /></button>
              <div className="mb-6 border-b border-neutral-200 dark:border-neutral-800 pb-6 pr-12">
                <div className="flex justify-between items-start">
                  <div><h2 className="text-3xl font-extrabold tracking-tight mb-1">{selectedStudent.name}</h2><p className="font-mono opacity-60 font-medium">{selectedStudent.rollNo}</p></div>
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-xl ${selectedStudent.status === 'Approved' ? (isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-700') : selectedStudent.status === 'Rejected' ? (isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-100 text-red-700') : (isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-700')}`}>{selectedStudent.status}</span>
                </div>
              </div>
              {selectedStudent.projectTitle ? (
                <div className={`p-6 rounded-2xl mb-8 ${isDarkMode ? 'bg-black/20' : 'bg-neutral-50'} shadow-inner`}>
                  <h3 className="text-xl font-bold mb-4">{selectedStudent.projectTitle}</h3>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {selectedStudent.domain && <span className={`text-xs px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider flex items-center gap-1.5 ${theme.lightBg} ${theme.text}`}><Globe size={14}/> {selectedStudent.domain}</span>}
                    {selectedStudent.tools && <span className={`text-xs px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDarkMode ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-200 text-neutral-600'}`}><Wrench size={14}/> {selectedStudent.tools}</span>}
                  </div>
                  <p className="text-sm opacity-80 leading-relaxed mb-6">{selectedStudent.projectDesc}</p>
                  {selectedStudent.pdfUrl ? (
                    <a href={selectedStudent.pdfUrl} target="_blank" rel="noreferrer" className={`text-sm px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold w-fit transition-colors duration-300 ${theme.bg} text-white shadow-md hover:scale-[1.02] active:scale-95`}><FileText size={16}/> View Complete PDF Document</a>
                  ) : <span className={`text-sm px-4 py-2 rounded-xl flex items-center gap-2 font-bold w-fit opacity-70 ${isDarkMode ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-200 text-neutral-600'}`}>No PDF Attached</span>}
                </div>
              ) : <div className={`mb-8 text-center p-8 rounded-2xl ${isDarkMode ? 'bg-neutral-800/50' : 'bg-neutral-100'}`}><FileText size={40} className="mx-auto mb-3 opacity-20" /><p className="font-bold opacity-50">Project details have not been submitted yet.</p></div>}
              <div>
                <h4 className="font-extrabold text-sm tracking-widest uppercase opacity-40 mb-4">Supervisor Actions</h4>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleAction(selectedStudent._id, 'Approved')} disabled={!selectedStudent.projectTitle || selectedStudent.status === 'Approved'} className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 text-white py-3.5 rounded-xl text-sm font-bold shadow-md">Approve Project</motion.button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleAction(selectedStudent._id, 'Rejected')} disabled={!selectedStudent.projectTitle || selectedStudent.status === 'Rejected'} className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-30 text-white py-3.5 rounded-xl text-sm font-bold shadow-md">Reject Project</motion.button>
                  </div>
                  <div className="flex gap-3 items-center">
                    <div className={`flex-1 flex items-center p-2 rounded-xl border focus-within:border-blue-500 ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'}`}>
                      <input placeholder="Enter target Migration Code..." className="w-full bg-transparent px-3 text-sm focus:outline-none uppercase font-mono font-medium" onChange={(e) => setMigrationInput({...migrationInput, [selectedStudent._id]: e.target.value.toUpperCase()})} />
                      <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleMigrate(selectedStudent._id)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${theme.bg} text-white`}><ArrowRightLeft size={14}/> Migrate</motion.button>
                    </div>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleRemoveStudent(selectedStudent._id, selectedStudent.name)} title="Remove Student" className="p-3.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors border border-transparent hover:border-red-500 flex items-center justify-center shadow-sm"><UserMinus size={20}/></motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

{/* responsive */}
      <GlassCard isDarkMode={isDarkMode} className="w-full flex flex-col md:flex-row justify-between items-start md:items-center p-6 md:px-8 gap-5">
        <div className="w-full">
          <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-3">
            <div className={`p-2 rounded-xl ${theme.lightBg} ${theme.text} transition-colors duration-500`}>
              <LayoutDashboard size={20} />
            </div>
            Supervisor Panel
          </h2>
          <div className="font-medium opacity-60 mt-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span>Welcome, {session?.user?.name}</span>
            <span className="hidden sm:block opacity-40 text-sm">|</span>
            <span>
              Your Code: <span className={`font-mono px-2 py-0.5 rounded-md ${theme.lightBg} ${theme.text}`}>{myMigrationCode}</span>
            </span>
          </div>
        </div>

        {/* Action Buttons Container */}
        <div className="flex items-center gap-3 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-neutral-200 dark:border-neutral-800 transition-colors">
          <motion.button
            whileHover={{ scale: isExporting ? 1 : 1.05 }}
            whileTap={{ scale: isExporting ? 1 : 0.95 }}
            onClick={handleExportPDF}
            disabled={isExporting}
            className={`flex-1 md:flex-none justify-center flex items-center gap-2 px-3 sm:px-5 py-2.5 rounded-2xl font-bold text-sm sm:text-base transition-all ${isExporting ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'} ${theme.bg} text-white shadow-md`}
          >
            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            <span className="whitespace-nowrap">{isExporting ? 'Downloading...' : 'Export Excel'}</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => signOut({ redirect: false })}
            className={`flex-1 md:flex-none justify-center bg-red-500/10 hover:bg-red-500 ${isDarkMode ? 'text-red-400' : 'text-red-600'} hover:text-white px-3 sm:px-6 py-2.5 rounded-2xl transition-all font-bold text-sm sm:text-base flex items-center gap-2`}
          >
            <LogIn size={20} className="rotate-180" /> 
            <span className="whitespace-nowrap">Logout</span>
          </motion.button>
        </div>
      </GlassCard>
      <GlassCard isDarkMode={isDarkMode} className="flex-1 p-8">
        <h3 className="text-xl font-extrabold tracking-tight mb-8">My Assigned Students <span className={`text-sm font-medium px-2 py-1 rounded-lg ml-2 ${theme.lightBg} ${theme.text}`}>{myStudents.length}</span></h3>
        {myStudents.length === 0 ? (
           <div className="text-center py-20 opacity-40 border-2 border-dashed rounded-3xl dark:border-neutral-700 font-medium">No students assigned to you yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {myStudents.map(student => (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ scale: 1.02, y: -4 }} whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedStudent(student)} key={student._id} 
                  className={`cursor-pointer p-6 rounded-[2rem] border flex flex-col justify-between transition-all duration-300 hover:shadow-xl ${isDarkMode ? 'bg-neutral-800/50 border-neutral-700/50 hover:border-neutral-600' : 'bg-neutral-50/50 border-neutral-200/50 hover:border-neutral-300'}`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div><h4 className="font-extrabold text-lg tracking-tight line-clamp-1 pr-2">{student.name}</h4><p className="text-xs font-mono font-medium opacity-50">{student.rollNo}</p></div>
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-lg shrink-0 ${student.status === 'Approved' ? (isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-700') : student.status === 'Rejected' ? (isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-100 text-red-700') : (isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-700')}`}>{student.status}</span>
                    </div>
                    {student.projectTitle ? (
                      <div className="mb-2">
                        <p className="text-sm font-bold tracking-tight line-clamp-1">{student.projectTitle}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {student.domain && <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${theme.lightBg} ${theme.text} line-clamp-1`}><Globe size={10} className="inline mr-1 mb-0.5"/>{student.domain}</span>}
                          {student.tools && <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${isDarkMode ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-200 text-neutral-600'} line-clamp-1`}><Wrench size={10} className="inline mr-1 mb-0.5"/>{student.tools}</span>}
                        </div>
                      </div>
                    ) : <div className={`text-xs opacity-50 font-medium italic mt-2`}>No project data</div>}
                  </div>
                  <div className={`mt-4 pt-4 border-t flex justify-between items-center text-xs font-bold transition-opacity ${theme.text} ${isDarkMode ? 'border-neutral-800' : 'border-neutral-200'}`}>
                    <span>Click to view full details</span><ChevronRight size={16} />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
};

const StudentDashboard = ({ isDarkMode, theme, session, showDialog }: any) => {
  const [data, setData] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [domain, setDomain] = useState(''); 
  const [tools, setTools] = useState('');   
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [localSups, setLocalSups] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/dashboard/student?id=${(session?.user as any)?.id}`);
      const json = await res.json();
      setData(json);
      if (json?.student) { 
        setTitle(json.student.projectTitle || ''); 
        setDesc(json.student.projectDesc || ''); 
        setDomain(json.student.domain || ''); 
        setTools(json.student.tools || '');   
      }
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
  };

  useEffect(() => {
    fetchData();
    fetch('/api/supervisors').then(res => res.json()).then(data => setLocalSups(Array.isArray(data) ? data : [])).catch(console.error);
  }, []);

  const me = data?.student;
  const supervisor = data?.supervisor;
  const isUnassigned = !me?.supervisorId || me?.status === 'Unassigned';
  const canSubmit = me?.status === 'Pending' || me?.status === 'Rejected';

  const handleSubmitProject = async (e: any) => {
    e.preventDefault();
    if (!canSubmit) return;
    
    let pdfUrl = me?.pdfUrl || '';

    if (!file && !pdfUrl) {
      showDialog({ title: "Document Required", message: "You must attach a PDF document to submit your project." });
      return;
    }

    setIsSubmitting(true);
    
    if (file) {
      const formData = new FormData(); formData.append('file', file);
      try {
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        if (uploadRes.ok) pdfUrl = (await uploadRes.json()).url; else { showDialog({ title: "Upload Failed", message: "Failed to upload PDF." }); setIsSubmitting(false); return; }
      } catch (err) { showDialog({ title: "Network Error", message: "Connection to server failed." }); setIsSubmitting(false); return; }
    }

    const res = await fetch('/api/dashboard/student', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: (session?.user as any)?.id, title, desc, domain, tools, pdfUrl })
    });

    if (res.ok) { showDialog({ title: "Success!", message: "Project submitted successfully." }); setFile(null); fetchData(); } 
    else { showDialog({ title: "Error", message: "Failed to submit project." }); }
    setIsSubmitting(false);
  };

  const handleAssignSupervisor = async (e: any) => {
    e.preventDefault();
    const res = await fetch('/api/dashboard/student', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assignSupervisor', id: (session?.user as any)?.id, supervisorId: e.target.newSup.value })
    });
    if (res.ok) { showDialog({ title: "Success!", message: "Supervisor assigned." }); fetchData(); }
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-[80vh]"><Loader2 className={`animate-spin ${theme.text}`} size={40}/></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6 min-h-[80vh]">
      <GlassCard isDarkMode={isDarkMode} className="w-full flex justify-between items-center px-8 py-6">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight">Hello, {me?.name}</h2>
          <p className="font-medium opacity-60 mt-1 flex items-center gap-2">
            Roll No: <span className="font-mono">{me?.rollNo}</span> <span className="opacity-40 text-sm">|</span> 
            Supervisor: <span className={`font-bold ${isUnassigned ? 'text-red-500' : theme.text} transition-colors duration-500`}>{isUnassigned ? "Not Assigned" : supervisor?.name}</span>
          </p>
        </div>
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => signOut({ redirect: false })} className={`bg-red-500/10 hover:bg-red-500 ${isDarkMode ? 'text-red-400' : 'text-red-600'} hover:text-white px-6 py-2.5 rounded-2xl transition-all font-bold flex items-center gap-2`}><LogIn size={20} className="rotate-180" /> Logout</motion.button>
      </GlassCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        <GlassCard isDarkMode={isDarkMode} className="col-span-1 lg:col-span-2 p-8 flex flex-col justify-center">
          {isUnassigned ? (
            <div className="text-center py-10">
              <UserMinus size={64} className="mx-auto mb-6 opacity-30" />
              <h3 className="text-2xl font-extrabold mb-2">You need a Supervisor</h3>
              <p className="opacity-60 mb-8 max-w-md mx-auto">To submit a project, you must first select a new supervisor from the list below.</p>
              <form onSubmit={handleAssignSupervisor} className="max-w-sm mx-auto space-y-4">
                <div className="relative group">
                  <select name="newSup" required className={`w-full pl-4 pr-10 py-3.5 rounded-2xl border-2 border-transparent transition-all duration-300 outline-none appearance-none ${isDarkMode ? 'bg-neutral-800 text-white' : 'bg-neutral-100/70 text-black'} ${theme.ring} focus:bg-transparent`}>
                    <option value="">-- Choose a Supervisor --</option>
                    {Array.isArray(localSups) && localSups.map(sup => <option key={sup._id} value={sup._id}>{sup.name}</option>)}
                  </select>
                </div>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" className={`w-full ${theme.bg} text-white font-bold py-4 rounded-2xl transition-colors duration-500 shadow-lg`}>Assign Supervisor</motion.button>
              </form>
            </div>
          ) : (
            <>
              <h3 className="text-xl font-extrabold tracking-tight mb-8 flex items-center gap-3"><div className={`p-2 rounded-xl ${theme.lightBg} ${theme.text} transition-colors duration-500`}><Upload size={20} /></div> Project Details</h3>
              
              {canSubmit ? (
                <div className={`p-5 mb-8 rounded-2xl flex gap-4 text-sm font-medium items-start ${isDarkMode ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                  <AlertTriangle size={24} className="shrink-0 mt-0.5" />
                  <p className="leading-relaxed"><b>Important:</b> A PDF document is strictly required. Once submitted, your project will be locked for review. You can only resubmit if your supervisor rejects it.</p>
                </div>
              ) : (
                <div className={`p-5 mb-8 rounded-2xl flex gap-4 text-sm font-medium items-start ${isDarkMode ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-blue-50 text-blue-800 border border-blue-200'}`}>
                  <Lock size={24} className="shrink-0 mt-0.5" />
                  <p className="leading-relaxed"><b>Project Locked:</b> Your project is currently {me?.status.toLowerCase()}. You cannot make changes unless your supervisor rejects it. Contact your supervisor for assistance.</p>
                </div>
              )}

              <form onSubmit={handleSubmitProject} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2 opacity-80 pl-1">Project Title</label>
                  <StyledInput isDarkMode={isDarkMode} theme={theme} disabled={!canSubmit} value={title} onChange={(e:any) => setTitle(e.target.value)} required type="text" placeholder="e.g. AI Based Disease Predictor" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium mb-2 opacity-80 pl-1">Project Domain</label>
                    <StyledInput isDarkMode={isDarkMode} theme={theme} disabled={!canSubmit} icon={Globe} value={domain} onChange={(e:any) => setDomain(e.target.value)} required type="text" placeholder="e.g. Machine Learning" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 opacity-80 pl-1">Tools & Technology</label>
                    <StyledInput isDarkMode={isDarkMode} theme={theme} disabled={!canSubmit} icon={Wrench} value={tools} onChange={(e:any) => setTools(e.target.value)} required type="text" placeholder="e.g. Next.js, Python" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 opacity-80 pl-1">Project Description</label>
                  <textarea disabled={!canSubmit} value={desc} onChange={(e:any) => setDesc(e.target.value)} required rows={4} className={`w-full px-4 py-3.5 rounded-2xl border-2 border-transparent transition-all duration-300 outline-none resize-none ${isDarkMode ? 'bg-neutral-800 text-white placeholder-neutral-500' : 'bg-neutral-100/70 text-black placeholder-neutral-400'} ${!canSubmit ? 'opacity-50 cursor-not-allowed' : `${theme.ring} focus:bg-transparent`}`} placeholder="Briefly describe your core objectives..." />
                </div>

                <div className={`p-8 border-2 border-dashed rounded-[2rem] text-center relative transition-all duration-300 group ${isDarkMode ? 'border-neutral-700 bg-neutral-800/30' : 'border-neutral-300 bg-neutral-50'} ${!canSubmit ? 'opacity-60 cursor-not-allowed' : `hover:${theme.border} hover:bg-transparent`}`}>
                  <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 transition-colors duration-500 ${file ? theme.lightBg : (isDarkMode ? 'bg-neutral-800' : 'bg-neutral-200')}`}><FileText size={32} className={`transition-colors duration-500 ${file ? theme.text : 'text-neutral-400'}`} /></div>
                  <p className={`text-base font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-black'}`}>{file ? file.name : "Upload PDF Document"}</p>
                  <p className="text-sm font-medium opacity-50 mt-1">{file ? "Ready to submit" : "Drag and drop or click to browse"}</p>
                  <input disabled={!canSubmit} type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className={`absolute inset-0 w-full h-full opacity-0 ${canSubmit ? 'cursor-pointer' : 'cursor-not-allowed'}`} title={canSubmit ? "Select a PDF" : "Locked"} />
                  {canSubmit && <div className={`mt-6 px-6 py-2.5 rounded-xl text-sm font-bold inline-block transition-colors duration-500 shadow-sm ${file ? `${theme.lightBg} ${theme.text}` : (isDarkMode ? 'bg-neutral-700 text-white' : 'bg-neutral-200 text-black')}`}>{file ? "Change File" : "Browse Files"}</div>}
                </div>
                {me?.pdfUrl && !file && <p className="text-sm text-emerald-500 font-medium flex items-center gap-2 pl-2"><CheckCircle size={16}/> Active PDF on file. {canSubmit ? "Submitting a new file will overwrite it." : "Your file is locked for review."}</p>}
                
                {canSubmit && (
                  <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} disabled={isSubmitting} type="submit" className={`w-full ${theme.bg} disabled:opacity-50 text-white font-bold py-4 rounded-[1.5rem] flex items-center justify-center gap-2 text-lg transition-colors duration-500 shadow-lg mt-4`}>
                    {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />} {isSubmitting ? "Uploading Securely..." : "Submit Project"}
                  </motion.button>
                )}
              </form>
            </>
          )}
        </GlassCard>

        <GlassCard isDarkMode={isDarkMode} className="col-span-1 p-8 flex flex-col">
          <h3 className="text-xl font-extrabold tracking-tight mb-8">Live Status</h3>
          <div className={`p-8 rounded-[2rem] flex flex-col items-center justify-center text-center flex-1 border transition-all duration-500 ${
            isUnassigned ? (isDarkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-100/50 border-red-200') :
            me?.status === 'Approved' ? (isDarkMode ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-100/50 border-emerald-200') :
            me?.status === 'Rejected' ? (isDarkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-100/50 border-red-200') :
            me?.status === 'Submitted For Review' ? (isDarkMode ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-100/50 border-amber-200') :
            (isDarkMode ? 'bg-neutral-800/50 border-neutral-700' : 'bg-neutral-100/50 border-neutral-200')
          }`}>
            <div className={`${isDarkMode ? 'bg-neutral-900' : 'bg-white'} p-4 rounded-3xl shadow-sm mb-6`}>
              {isUnassigned ? <UserMinus size={40} className="text-red-500" /> :
               me?.status === 'Approved' ? <CheckCircle size={40} className="text-emerald-500" /> :
               me?.status === 'Rejected' ? <XCircle size={40} className="text-red-500" /> :
               me?.status === 'Submitted For Review' ? <Send size={40} className="text-amber-500" /> :
               <FileText size={40} className="text-neutral-400" />}
            </div>
            
            <h4 className="text-2xl font-black tracking-tight">{isUnassigned ? "Unassigned" : me?.status}</h4>
            <p className="text-sm mt-3 font-medium opacity-60 px-4 leading-relaxed">
              {isUnassigned ? "You are not assigned to any supervisor." :
               me?.status === 'Pending' ? "You haven't submitted your FYP yet. Please fill the form to begin." : "Your supervisor has been automatically notified."}
            </p>
          </div>

          {me?.remarks && (
            <div className="mt-8">
              <p className="text-sm font-extrabold tracking-tight mb-3 opacity-80 flex items-center gap-2"><LayoutDashboard size={16}/> Supervisor Remarks</p>
              <div className={`p-5 rounded-2xl text-sm font-medium leading-relaxed border shadow-inner ${isDarkMode ? 'bg-neutral-800/50 border-neutral-800' : 'bg-neutral-100 border-neutral-200'}`}>
                "{me.remarks}"
              </div>
            </div>
          )}
        </GlassCard>
      </div>
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
  const theme = getTheme(activeAccent, isDarkMode);

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

  const showDialog = ({ type = 'alert', title, message, onConfirm = () => {}, defaultValue = '' }: any) => {
    setDialog({ isOpen: true, type, title, message, onConfirm, defaultValue });
  };
  const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));

  const cycleTheme = () => {
    const keys: ThemeKey[] = ['ocean', 'fiery', 'zen'];
    setActiveAccent(keys[(keys.indexOf(activeAccent) + 1) % keys.length]);
  };

  useEffect(() => {
    if (isRegistering) fetch('/api/supervisors').then(res => res.json()).then(data => setSupervisorsList(Array.isArray(data) ? data : [])).catch(console.error);
  }, [isRegistering]);

  const renderView = () => {
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
  };

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