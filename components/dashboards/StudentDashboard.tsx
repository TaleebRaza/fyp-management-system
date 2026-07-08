'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut } from 'next-auth/react';
import { 
  Users, 
  UserMinus, 
  CheckCircle, 
  XCircle, 
  Send, 
  Upload, 
  Lock, 
  Globe, 
  Wrench, 
  AlertTriangle, 
  Megaphone,
  LayoutDashboard, 
  Loader2, 
  LogIn,
  ClipboardCheck,
  Info
} from 'lucide-react';
import { GlassCard, StyledInput } from '../ui/SharedUI';
import { Timeline } from '../ui/Timeline';
import { VoiceChat } from '../ui/VoiceChat';
import { PROGRAM_MAP } from '../../config/appSettings';
import { ExternalLink, Copy, Check, Eye, X, FileText, Code, Download, ChevronDown } from 'lucide-react'; 

const StudentDashboard = ({ isDarkMode, theme, session, showDialog }: any) => {
  // --- STATE MANAGEMENT ---
  const [data, setData] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [domain, setDomain] = useState(''); 
  const [tools, setTools] = useState('');   
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [localSups, setLocalSups] = useState<any[]>([]);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [headline, setHeadline] = useState('');
  const [isUpdatesExpanded, setIsUpdatesExpanded] = useState(false);
  
  // --- OPTIMIZATION: Dynamic Timeline Template State ---
  const [cachedTemplates, setCachedTemplates] = useState<any[]>([]);
  const [isFetchingTemplates, setIsFetchingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [previewMode, setPreviewMode] = useState<'rendered' | 'code'>('rendered');
  const [isCopied, setIsCopied] = useState(false);

  const [isAcademicDialogOpen, setIsAcademicDialogOpen] = useState(false);
  const [isAcademicWarningStep, setIsAcademicWarningStep] = useState(false);
  const [isAcademicUpdating, setIsAcademicUpdating] = useState(false);
  const [academicForm, setAcademicForm] = useState({ program: '', batch: '' });

  const academicProgramOptions = Object.keys(PROGRAM_MAP);
  const academicBatchOptions: string[] = [];
  const academicStartYear = 2021;
  const academicMaxYear = new Date().getFullYear() + 1;

  for (let year = academicStartYear; year <= academicMaxYear; year++) {
    academicBatchOptions.push(`Spring ${year}`);
    academicBatchOptions.push(`Fall ${year}`);
  }

  // Wrapper to ensure modal always opens in rendered mode
  const handleOpenTemplate = (template: any) => {
    setPreviewMode('rendered');
    setSelectedTemplate(template);
  };

  const fetchTemplatesByStage = async () => {
    if (cachedTemplates.length > 0) return;
    setIsFetchingTemplates(true);
    try {
      const stage = data?.project?.stage || 'PROPOSAL';
      const res = await fetch(`/api/templates?stage=${stage}`);
      if (res.ok) {
        const json = await res.json();
        setCachedTemplates(json.templates || []);
      } else {
        throw new Error("Failed to load timeline templates.");
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
      showDialog({ title: "Network Error", message: "Failed to download templates from the server." });
    } finally {
      setIsFetchingTemplates(false);
    }
  };

  const handleCopyTemplate = () => {
    if (!selectedTemplate) return;
    navigator.clipboard.writeText(selectedTemplate.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // --- DATA FETCHING ---
  const fetchHeadline = async () => {
    try {
      const res = await fetch('/api/headline');
      const json = await res.json();
      if (json.headline && json.headline.text) {
        setHeadline(json.headline.text);
      }
    } catch (err) {
      console.error('Failed to fetch headline:', err);
    }
  };

  const fetchData = async () => {
    try {
      const userId = (session?.user as any)?.id;
      if (!userId) return;
      
      const res = await fetch(`/api/dashboard/student?id=${userId}`);
      const json = await res.json();
      setData(json);
      
      if (json?.student) { 
        setTitle(json.student.projectTitle || ''); 
        setDesc(json.student.projectDesc || ''); 
        setDomain(json.student.domain || ''); 
        setTools(json.student.tools || '');    
      }
    } catch (err) { 
      console.error('Dashboard fetch error:', err); 
    } finally { 
      setIsLoading(false); 
    }
  };

  const fetchSupervisors = async () => {
    try {
      const res = await fetch('/api/supervisors');
      const sData = await res.json();
      setLocalSups(Array.isArray(sData) ? sData : []);
    } catch (err) {
      console.error('Supervisor fetch error:', err);
    }
  };

  useEffect(() => {
    fetchHeadline();
    fetchData();
    fetchSupervisors();
  }, [session]);

  // --- HANDLERS ---
  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput) return;
    
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/project/join', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          studentId: (session?.user as any)?.id, 
          inviteCode: inviteCodeInput 
        })
      });
      
      const json = await res.json();
      if (res.ok) {
        showDialog({ title: "Success", message: "Successfully joined the team!" });
        setInviteCodeInput('');
        fetchData(); 
      } else {
        showDialog({ title: "Error", message: json.error || "Failed to join team" });
      }
    } catch (err) {
      showDialog({ title: "Error", message: "Network connection lost." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    let pdfUrl = me?.pdfUrl || '';
    
    if (!file && !pdfUrl) {
      showDialog({ 
        title: "Document Required", 
        message: "Please upload your project proposal PDF to proceed." 
      });
      return;
    }

    setIsSubmitting(true);
    
    if (file) {
      try {
        // --- OPTIMIZATION: Client-Side Direct R2 Handshake ---
        const urlRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, contentType: file.type, fileSize: file.size })
        });
        
        if (!urlRes.ok) {
          const errData = await urlRes.json();
          throw new Error(errData.error || "Failed to resolve secure upload hand-off. Check file size limits.");
        }
        
        const { uploadUrl, url } = await urlRes.json();
        
        // Stream bytes directly to Cloudflare R2
        const r2Res = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file
        });
        
        if (!r2Res.ok) throw new Error("Direct bucket ingest stream failed.");
        pdfUrl = url;
      } catch (err: any) {
          console.error("Direct bucket ingest stream failed:", err);
          
          let errorMessage = err.message || "Failed to resolve secure upload hand-off. Check file size limits.";
          
          // Intercept Vercel Blob's technical error and provide a student-friendly instruction
          if (errorMessage.includes("already exists")) {
            errorMessage = "A document with this exact name already exists on the server. Please rename your file slightly (e.g., 'proposal_v2.pdf') and try uploading it again.";
          }

          showDialog({ 
            title: "Upload Interrupted", 
            message: errorMessage 
          });
          setIsSubmitting(false);
          return;
        }
    }

    try {
      const res = await fetch('/api/dashboard/student', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: (session?.user as any)?.id, 
          title, 
          desc, 
          domain, 
          tools, 
          pdfUrl,
          fileSize: file ? file.size : 0 // --- NEW: Pass exact byte count to backend ---
        })
      });

      if (res.ok) { 
        showDialog({ title: "Success!", message: "Your project proposal has been submitted." }); 
        setFile(null); 
        fetchData(); 
      } else { 
        showDialog({ title: "Error", message: "Failed to save project details." }); 
      }
    } catch (err) {
      showDialog({ title: "Error", message: "An unexpected error occurred." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignSupervisor = async (e: any) => {
    e.preventDefault();
    const supId = e.target.newSup.value;
    if (!supId) return;

    try {
      const res = await fetch('/api/dashboard/student', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'assignSupervisor', 
          id: (session?.user as any)?.id, 
          supervisorId: supId 
        })
      });
      
      if (res.ok) { 
        showDialog({ title: "Assigned!", message: "Supervisor successfully selected." }); 
        fetchData(); 
      } else {
        const err = await res.json();
        showDialog({ title: "Error", message: err.error || "Assignment failed." });
      }
    } catch (err) {
      console.error(err);
    }
  };

    const openAcademicEditor = () => {
    setAcademicForm({
      program: me?.program || 'BSCS',
      batch: me?.batch || '',
    });
    setIsAcademicWarningStep(false);
    setIsAcademicDialogOpen(true);
  };

  const closeAcademicEditor = () => {
    if (isAcademicUpdating) return;

    setIsAcademicDialogOpen(false);
    setIsAcademicWarningStep(false);
  };

  const handleAcademicContinue = () => {
    if (!academicForm.program || !academicForm.batch) {
      showDialog({ title: "Selection Required", message: "Please select both Program and Batch." });
      return;
    }

    if (academicForm.program === me?.program && academicForm.batch === me?.batch) {
      showDialog({ title: "No Change", message: "Program and Batch are already set to these values." });
      return;
    }

    setIsAcademicWarningStep(true);
  };

  const handleAcademicUpdate = async () => {
    setIsAcademicUpdating(true);

    try {
      const res = await fetch('/api/dashboard/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateProgramBatch',
          id: (session?.user as any)?.id,
          program: academicForm.program,
          batch: academicForm.batch,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        showDialog({ title: "Update Blocked", message: json.error || "Failed to update Program/Batch." });
        return;
      }

      setIsAcademicDialogOpen(false);
      setIsAcademicWarningStep(false);
      setTitle('');
      setDesc('');
      setDomain('');
      setTools('');
      setFile(null);
      setCachedTemplates([]);

      await fetchData();
      await fetchSupervisors();

      showDialog({
        title: "Academic Info Updated",
        message: json.message || "Program and Batch updated successfully.",
      });
    } catch (error) {
      showDialog({ title: "Network Error", message: "Could not update Program/Batch. Please try again." });
    } finally {
      setIsAcademicUpdating(false);
    }
  };

  // --- HELPERS ---
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-4">
        <Loader2 className={`animate-spin ${theme.text}`} size={40}/>
        <p className="text-xs font-black opacity-30 animate-pulse uppercase tracking-widest">Initialising...</p>
      </div>
    );
  }

  const me = data?.student;
  const supervisor = data?.supervisor;
  const projectMembers = data?.project?.members || [];
  const isUnassigned = !me?.supervisorId || me?.status === 'Unassigned';
  const canSubmit = me?.status === 'Pending' || me?.status === 'Rejected' || me?.status === 'Changes Requested';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="flex flex-col gap-3 md:gap-6 min-h-screen pb-12 px-1 md:px-0 max-w-7xl mx-auto"
    >

          <AnimatePresence>
        {isAcademicDialogOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeAcademicEditor}
              className="absolute inset-0 bg-black/80 md:bg-black/60 md:backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`relative w-full max-w-lg p-6 rounded-[2rem] border shadow-2xl ${isDarkMode ? 'bg-[#18181b] border-white/10 text-white' : 'bg-white border-neutral-200 text-black'}`}
            >
              <button
                type="button"
                onClick={closeAcademicEditor}
                disabled={isAcademicUpdating}
                className={`absolute top-4 right-4 p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'} disabled:opacity-40`}
              >
                <X size={18} />
              </button>

              {!isAcademicWarningStep ? (
                <>
                  <div className={`w-14 h-14 rounded-2xl mb-5 flex items-center justify-center ${theme.lightBg} ${theme.text}`}>
                    <ClipboardCheck size={28} />
                  </div>

                  <h3 className="text-2xl font-extrabold tracking-tight mb-2">Edit Academic Info</h3>
                  <p className="text-sm opacity-60 font-medium leading-relaxed mb-6">
                    Select your correct Program and Batch. You will review a warning before the change is applied.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase opacity-40 tracking-widest ml-1">Program</label>
                      <select
                        value={academicForm.program}
                        onChange={(e) => setAcademicForm(prev => ({ ...prev, program: e.target.value }))}
                        className={`mt-2 w-full px-5 py-4 rounded-2xl border-2 border-transparent outline-none font-bold ${isDarkMode ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-black'} ${theme.ring}`}
                      >
                        <option value="">Select Program</option>
                        {academicProgramOptions.map(program => (
                          <option key={program} value={program}>
                            {program} - {PROGRAM_MAP[program]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase opacity-40 tracking-widest ml-1">Batch</label>
                      <select
                        value={academicForm.batch}
                        onChange={(e) => setAcademicForm(prev => ({ ...prev, batch: e.target.value }))}
                        className={`mt-2 w-full px-5 py-4 rounded-2xl border-2 border-transparent outline-none font-bold ${isDarkMode ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-black'} ${theme.ring}`}
                      >
                        <option value="">Select Batch</option>
                        {academicBatchOptions.map(batch => (
                          <option key={batch} value={batch}>{batch}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-8">
                    <button
                      type="button"
                      onClick={closeAcademicEditor}
                      className={`px-5 py-3 rounded-xl font-bold text-sm ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-300' : 'hover:bg-neutral-100 text-neutral-600'}`}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAcademicContinue}
                      className={`px-6 py-3 rounded-xl text-white font-black text-sm ${theme.bg}`}
                    >
                      Continue
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl mb-5 flex items-center justify-center bg-red-500/10 text-red-500">
                    <AlertTriangle size={28} />
                  </div>

                  <h3 className="text-2xl font-extrabold tracking-tight mb-2">Confirm Reset</h3>
                  <p className="text-sm opacity-70 font-medium leading-relaxed mb-5">
                    This will update your Program to <b>{academicForm.program}</b> and Batch to <b>{academicForm.batch}</b>.
                  </p>

                  <div className={`p-4 rounded-2xl border text-sm font-bold leading-relaxed ${isDarkMode ? 'bg-red-500/10 border-red-500/20 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    Confirming will remove you from your current team, unassign your supervisor, reset your project back to the proposal step, and clear your uploaded project data. If you are the only member in the team, the uploaded files for that project will also be deleted.
                  </div>

                  <p className="text-xs opacity-50 font-bold mt-4">
                    You can only change Program/Batch once per day.
                  </p>

                  <div className="flex justify-end gap-3 mt-8">
                    <button
                      type="button"
                      onClick={() => setIsAcademicWarningStep(false)}
                      disabled={isAcademicUpdating}
                      className={`px-5 py-3 rounded-xl font-bold text-sm ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-300' : 'hover:bg-neutral-100 text-neutral-600'} disabled:opacity-40`}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleAcademicUpdate}
                      disabled={isAcademicUpdating}
                      className="px-6 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                      {isAcademicUpdating ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
                      {isAcademicUpdating ? 'Updating...' : 'Yes, Reset My Dashboard'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* 1. COMPACT HEADER SECTION */}
      <GlassCard isDarkMode={isDarkMode} className="w-full p-3 md:px-8 md:py-6 relative overflow-hidden">
        {/* Added pointer-events-none so the glow never steals pointer actions */}
        <div className={`absolute top-0 right-0 w-32 h-32 md:w-48 md:h-48 blur-[80px] rounded-full opacity-10 ${theme.bg} pointer-events-none`} />
        
        <div className="relative z-10 flex justify-between items-center mb-3">
          <div className="flex flex-col">
            <h2 className="text-lg md:text-3xl font-black tracking-tight leading-none">
              Hi, {me?.name?.split(' ')[0]}
            </h2>
            <div className="flex items-center gap-2 mt-1 md:mt-1.5">
              <span className="text-[10px] md:text-xs font-mono font-bold opacity-40 uppercase">{me?.rollNo}</span>
              <span className="w-1 h-1 rounded-full bg-neutral-500/30" />
              <span className={`text-[9px] md:text-xs font-black uppercase ${theme.text}`}>{me?.program}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={openAcademicEditor}
              className={`flex items-center gap-2 p-2 md:px-4 md:py-2.5 rounded-xl transition-all text-xs md:text-sm font-bold cursor-pointer ${theme.lightBg} ${theme.text}`}
            >
              <ClipboardCheck size={16} className="shrink-0" />
              <span className="hidden md:inline font-extrabold">Edit Info</span>
            </motion.button>

            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }} 
              onClick={() => signOut({ redirect: false })} 
              className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white p-2 md:px-5 md:py-2.5 rounded-xl transition-all text-xs md:text-sm font-bold cursor-pointer"
            >
              <LogIn size={16} className="rotate-180 shrink-0" /> 
              <span className="hidden md:inline font-extrabold">Logout</span>
            </motion.button>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between border-t border-neutral-500/10 pt-3 md:pt-4">
          <div className="flex items-center gap-4 md:gap-8">
            <div className="flex flex-col">
              <span className="text-[8px] md:text-[10px] font-black opacity-30 uppercase tracking-widest">Batch</span>
              <span className="text-[11px] md:text-sm font-bold">{me?.batch || '202X'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] md:text-[10px] font-black opacity-30 uppercase tracking-widest">Semester</span>
              <span className="text-[11px] md:text-sm font-bold">{me?.semester || 'N/A'}</span>
            </div>
          </div>
          
          <div className="text-right">
             <span className="text-[8px] md:text-[10px] font-black opacity-30 uppercase tracking-widest block">Supervisor</span>
             <span className={`text-[11px] md:text-sm font-black ${isUnassigned ? 'text-red-500' : theme.text}`}>
               {isUnassigned ? 'NOT ASSIGNED' : supervisor?.name}
             </span>
          </div>
        </div>
      </GlassCard>

      {/* 2. TIMELINE SECTION (MOBILE OPTIMIZED) */}
      {!isUnassigned && (
        <div className="w-full px-1">
          <div className="bg-neutral-500/5 rounded-3xl p-1 md:p-2 overflow-hidden">
            <Timeline 
              currentStage={data?.project?.stage || 'PROPOSAL'} 
              isDarkMode={isDarkMode} 
              theme={theme} 
              isMobile={true} 
            />
          </div>
        </div>
      )}

      {/* 3. UNIFIED UPDATES BANNER */}
      {(() => {
        const hasAdminHeadline = !!headline;
        const hasSupBroadcast = !!supervisor?.broadcastType;
        const updateCount = (hasAdminHeadline ? 1 : 0) + (hasSupBroadcast ? 1 : 0);

        if (updateCount === 0) return null;

        return (
          <div className="w-full px-1">
            <GlassCard isDarkMode={isDarkMode} className={`p-0 overflow-hidden transition-all duration-300 ${isUpdatesExpanded ? 'ring-2 ring-indigo-500/50' : ''}`}>
              {/* Banner Header (Always visible, Clickable) */}
              <button 
                onClick={() => setIsUpdatesExpanded(!isUpdatesExpanded)}
                className={`w-full p-3 md:p-4 flex items-center justify-between transition-colors ${isDarkMode ? 'hover:bg-neutral-800/50' : 'hover:bg-neutral-100/50'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
                      <Megaphone size={18} />
                    </div>
                    {/* Pulsing Indicator */}
                    {!isUpdatesExpanded && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-white dark:border-neutral-900"></span>
                      </span>
                    )}
                  </div>
                  <div className="text-left">
                    <h4 className="text-sm font-black tracking-tight flex items-center gap-2">
                      Updates 
                      <span className="px-1.5 py-0.5 rounded-full bg-indigo-500 text-white text-[9px] font-bold">{updateCount}</span>
                    </h4>
                    <p className="text-[10px] opacity-60 font-medium mt-0.5 hidden sm:block">
                      {isUpdatesExpanded ? 'Click to collapse' : 'Click to expand announcements'}
                    </p>
                  </div>
                </div>
                <ChevronDown size={18} className={`opacity-50 transition-transform duration-300 ${isUpdatesExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Expandable Content */}
              <AnimatePresence>
                {isUpdatesExpanded && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }} 
                    animate={{ height: 'auto', opacity: 1 }} 
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-neutral-500/10 bg-neutral-500/5"
                  >
                    <div className="max-h-64 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
                      
                      {/* Admin Headline */}
                      {hasAdminHeadline && (
                        <div className="border-l-4 border-l-blue-500 pl-3">
                          <h5 className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-1">From Administration</h5>
                          <p className="text-xs font-bold leading-relaxed break-words">
                            {headline.split(/(https?:\/\/[^\s]+)/g).map((part: string, i: number) => 
                              part.match(/(https?:\/\/[^\s]+)/) ? (
                                <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline decoration-blue-500/40 hover:decoration-blue-500 text-blue-600 transition-all">{part}</a>
                              ) : (
                                <span key={i}>{part}</span>
                              )
                            )}
                          </p>
                        </div>
                      )}

                      {/* Divider if both exist */}
                      {hasAdminHeadline && hasSupBroadcast && <hr className="border-neutral-500/20" />}

                      {/* Supervisor Broadcast */}
                      {hasSupBroadcast && (
                        <div className="border-l-4 border-l-indigo-500 pl-3">
                          <h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-1 flex items-center gap-1.5">
                            From Supervisor: {supervisor.name}
                          </h5>
                          {supervisor.broadcastType === 'text' ? (
                            <p className="text-xs font-bold leading-relaxed whitespace-pre-wrap">{supervisor.broadcastContent}</p>
                          ) : (
                            <div className="mt-2 w-full max-w-[280px]">
                              <audio 
                                src={`/api/read-pdf?url=${encodeURIComponent(
                                  supervisor.broadcastContent.includes('.com/') 
                                    ? supervisor.broadcastContent.split('.com/')[1] 
                                    : supervisor.broadcastContent
                                )}`} 
                                controls 
                                className="w-full h-8 outline-none"
                              />
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          </div>
        );
      })()}

      {/* 4. MAIN DASHBOARD CONTENT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        
        {/* FORM COLUMN */}
        <div className="lg:col-span-2 order-2 lg:order-1 flex flex-col gap-4">
          <GlassCard isDarkMode={isDarkMode} className="p-4 md:p-8">
            {isUnassigned ? (
              <div className="text-center py-8">
                <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
                  <UserMinus size={30} className="opacity-20" />
                </div>
                <h3 className="text-lg font-black mb-2">Supervisor Required</h3>
                <p className="text-xs opacity-50 mb-6 max-w-xs mx-auto">
                {me?.remarks || 'Please select an available supervisor or join a team to begin your Final Year Project journey.'}
                </p>
                
                <form onSubmit={handleAssignSupervisor} className="max-w-xs mx-auto space-y-3">
                  <select 
                    name="newSup" 
                    required 
                    className={`w-full px-4 py-3 rounded-2xl border-2 border-transparent transition-all outline-none text-xs font-bold ${isDarkMode ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-black'} ${theme.ring}`}
                  >
                    <option value="">Choose a Supervisor...</option>
                    {localSups.map(sup => (
                      <option key={sup._id} value={sup._id} disabled={sup.isFull}>
                        {sup.name} {sup.isFull ? '(FULL)' : `(${sup.filledSlots}/${sup.maxSlots})`}
                      </option>
                    ))}
                  </select>
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    type="submit" 
                    className={`w-full ${theme.bg} text-white font-black py-3.5 rounded-2xl shadow-lg text-xs uppercase tracking-widest`}
                  >
                    Confirm Assignment
                  </motion.button>
                </form>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${theme.lightBg} ${theme.text}`}><Upload size={18} /></div>
                    <div>
                      <h3 className="text-base font-black">Project Details</h3>
                      <p className="text-[9px] opacity-40 uppercase font-black tracking-tighter">Proposal Submission</p>
                    </div>
                  </div>
                  {me?.pdfUrl && (
                    <a 
                      href={`/api/read-pdf?url=${encodeURIComponent(
                        me.pdfUrl.includes('.com/') ? me.pdfUrl.split('.com/')[1] : me.pdfUrl.replace(/^\//, '')
                      )}`} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="flex items-center gap-1 text-[10px] font-black text-blue-500 hover:underline"
                    >
                      <ExternalLink size={12}/> View PDF
                    </a>
                  )}
                </div>
                
                {!canSubmit && (
                  <div className={`p-4 mb-6 rounded-2xl flex gap-3 text-xs font-bold items-center ${isDarkMode ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                    <Lock size={16} className="shrink-0" />
                    <p>Submissions are closed while project is <b>{me?.status}</b>.</p>
                  </div>
                )}

                <form onSubmit={handleSubmitProject} className="space-y-4 md:space-y-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase opacity-40 ml-1 tracking-widest">Title</label>
                    <StyledInput isDarkMode={isDarkMode} theme={theme} disabled={!canSubmit} value={title} onChange={(e:any) => setTitle(e.target.value)} required placeholder="Project Title" />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase opacity-40 ml-1 tracking-widest">Domain</label>
                      <StyledInput isDarkMode={isDarkMode} theme={theme} disabled={!canSubmit} icon={Globe} value={domain} onChange={(e:any) => setDomain(e.target.value)} required placeholder="e.g. Cyber Security" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase opacity-40 ml-1 tracking-widest">Tools</label>
                      <StyledInput isDarkMode={isDarkMode} theme={theme} disabled={!canSubmit} icon={Wrench} value={tools} onChange={(e:any) => setTools(e.target.value)} required placeholder="e.g. React, Python" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase opacity-40 ml-1 tracking-widest">
                      Description
                    </label>
                    <textarea 
                      disabled={!canSubmit} 
                      value={desc} 
                      onChange={(e:any) => setDesc(e.target.value)} 
                      required 
                      rows={3} 
                      className={`w-full px-4 py-3 rounded-2xl border-2 border-transparent transition-all outline-none resize-none text-xs font-medium ${isDarkMode ? 'bg-neutral-800 text-white' : 'bg-neutral-100/70 text-black'} ${!canSubmit ? 'opacity-50' : `${theme.ring} focus:bg-transparent`}`} 
                      placeholder="Enter a brief description of your project..." 
                    />
                  </div>

                  {/* --- OPTIMIZATION: External Tools & Templates (Zero-Cost Architecture) --- */}
                  {canSubmit && (
                    <div className={`mb-4 p-4 rounded-2xl border flex flex-col gap-3 ${isDarkMode ? 'bg-neutral-900/50 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-black uppercase opacity-40 tracking-widest">Writing Resources</label>
                        <a 
                          href="https://www.overleaf.com/project" 
                          target="_blank" 
                          rel="noreferrer"
                          className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-sm active:scale-95 ${theme.bg} text-white`}
                        >
                          Open Overleaf <ExternalLink size={12} />
                        </a>
                      </div>
                      
                      <div className="w-full">
                        {cachedTemplates.length === 0 ? (
                          <button
                            type="button"
                            onClick={fetchTemplatesByStage}
                            disabled={isFetchingTemplates}
                            className={`w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-xs font-bold transition-all border ${isDarkMode ? 'bg-neutral-800 border-neutral-700 hover:border-neutral-500 text-neutral-300' : 'bg-white border-neutral-200 hover:border-neutral-400 text-neutral-700'}`}
                          >
                            {isFetchingTemplates ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                            {isFetchingTemplates ? "Downloading Templates..." : `Load ${data?.project?.stage ? data.project.stage.replace('_', ' ') : 'PROPOSAL'} Templates`}
                          </button>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 w-full max-h-48 overflow-y-auto custom-scrollbar p-1">
                            {cachedTemplates.map((template) => (
                              <button 
                                key={template.id}
                                type="button"
                                onClick={() => handleOpenTemplate(template)}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${isDarkMode ? 'bg-neutral-800 border-neutral-700 hover:border-neutral-500 text-neutral-300' : 'bg-white border-neutral-200 hover:border-neutral-400 text-neutral-700'}`}
                                title={template.filename}
                              >
                                <span className="truncate pr-2">{template.title}</span>
                                <Eye size={14} className="opacity-50 shrink-0" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-[9px] text-center opacity-40 font-bold">Copy a template, paste into Overleaf, and export as PDF to upload below.</p>
                    </div>
                  )}

                  <div className={`group relative p-6 border-2 border-dashed rounded-3xl text-center transition-all ${isDarkMode ? 'border-neutral-700 hover:bg-neutral-800/40' : 'border-neutral-200 hover:bg-neutral-50'} ${!canSubmit ? 'opacity-40' : `hover:${theme.border}`}`}>
                    <div className="flex flex-col items-center gap-2">
                      <div className={`p-3 rounded-full ${file ? theme.lightBg : 'bg-neutral-500/5'}`}>
                        <FileText size={20} className={file ? theme.text : 'opacity-20'} />
                      </div>
                      <p className="text-[11px] font-black truncate max-w-[200px] mx-auto">
                        {file ? file.name : "Upload Proposal (PDF)"}
                      </p>
                    </div>
                    <input 
                      disabled={!canSubmit} 
                      type="file" 
                      accept="application/pdf" 
                      onChange={(e) => setFile(e.target.files?.[0] || null)} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                    />
                  </div>

                  {canSubmit && (
                    <motion.button 
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }} 
                      disabled={isSubmitting} 
                      type="submit" 
                      className={`w-full ${theme.bg} text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 text-xs uppercase tracking-widest shadow-xl transition-all`}
                    >
                      {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={16} />} 
                      {isSubmitting ? "Uploading..." : "Save & Submit"}
                    </motion.button>
                  )}
                </form>
              </>
            )}
          </GlassCard>
        </div>

        {/* SIDEBAR COLUMN */}
        <div className="col-span-1 order-1 lg:order-2 flex flex-col gap-4">
          
          {/* STATUS SECTION */}
          <GlassCard isDarkMode={isDarkMode} className="p-5 flex flex-col items-center text-center relative overflow-hidden">
            <div className={`absolute -bottom-6 -left-6 w-20 h-20 blur-3xl opacity-20 rounded-full ${theme.bg}`} />
            <h3 className="text-[9px] font-black uppercase tracking-[0.2em] opacity-30 mb-4">Project Status</h3>
            
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-inner ${isDarkMode ? 'bg-neutral-900' : 'bg-neutral-100'}`}>
              {me?.status === 'Approved' ? <CheckCircle size={28} className="text-emerald-500" /> :
               me?.status === 'Changes Requested' ? <AlertTriangle size={28} className="text-amber-500" /> :
               me?.status === 'Rejected' ? <XCircle size={28} className="text-red-500" /> :
               <Send size={28} className="text-blue-500" />}
            </div>
            
            <h4 className="text-lg font-black tracking-tight uppercase">{me?.status}</h4>
            
            {me?.remarks && (
              <div className="mt-4 w-full bg-neutral-500/5 rounded-2xl p-3 border border-neutral-500/10">
                <p className="text-[10px] font-bold italic leading-relaxed opacity-70">
                  "{me.remarks}"
                </p>
              </div>
            )}
          </GlassCard>

          {/* TEAM SECTION */}
          <GlassCard isDarkMode={isDarkMode} className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-neutral-500/10">
                <div className="flex items-center gap-2.5">
                  <Users size={20} className={theme.text} />
                  <h3 className="font-black text-xs md:text-sm uppercase tracking-wider">My Team</h3>
                </div>
                <div className="px-3 py-1 rounded-full bg-neutral-500/10 text-xs font-black">
                 {projectMembers.length}/{data?.project?.maxTeamSize || 2}
                </div>
            </div>

            {data?.project ? (
              <div className="space-y-5">
                <div className="space-y-3">
                  {projectMembers.map((member: any) => (
                    <div key={member._id} className="flex items-center justify-between p-3 md:p-4 rounded-2xl bg-neutral-500/5 border border-neutral-500/5">
                      <div className="flex items-center gap-4 overflow-hidden">
                        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-xs md:text-sm font-black text-white bg-gradient-to-br ${theme.gradient} shrink-0 shadow-sm`}>
                          {member.name.charAt(0)}
                        </div>
                        <div className="flex flex-col overflow-hidden gap-0.5">
                          <span className="text-sm md:text-base font-black truncate tracking-tight">{member.name}</span>
                          <span className="text-xs md:text-sm opacity-60 font-mono font-medium">{member.rollNo}</span>
                        </div>
                      </div>
                      {member.rollNo === me.rollNo && (
                         <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2 shadow-[0_0_10px_rgba(16,185,129,0.5)]" title="You" />
                      )}
                    </div>
                  ))}
                </div>

                {projectMembers.length < (data?.project?.maxTeamSize || 2) && (
                  <div className="space-y-3 pt-2">
                    <form onSubmit={handleJoinTeam} className="flex gap-2.5">
                      <input 
                        type="text" 
                        placeholder="Invite Code" 
                        value={inviteCodeInput}
                        onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                        className={`flex-1 px-4 py-3 text-xs md:text-sm rounded-xl outline-none font-mono font-black ${isDarkMode ? 'bg-neutral-900' : 'bg-neutral-100'} border-2 border-transparent focus:border-blue-500/30 transition-all shadow-inner`}
                      />
                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        type="submit" 
                        className={`px-5 py-3 rounded-xl text-xs font-black text-white shadow-lg ${theme.bg}`}
                      >
                        JOIN
                      </motion.button>
                    </form>
                  </div>
                )}
                
                <div className={`mt-3 p-4 rounded-2xl border-2 border-dotted ${isDarkMode ? 'border-neutral-800 bg-neutral-900/50' : 'border-neutral-100 bg-neutral-50/50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] md:text-xs font-black opacity-40 uppercase tracking-widest mb-1">Your Code</p>
                      <p className="text-sm md:text-base font-mono font-black tracking-widest text-blue-500">{data.project.inviteCode || '---'}</p>
                    </div>
                    <ClipboardCheck size={20} className="opacity-20" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center opacity-30">
                <Users size={28} className="mx-auto mb-2" />
                <p className="text-xs md:text-sm font-black uppercase tracking-widest">No Team</p>
              </div>
            )}
          </GlassCard>

          {/* --- OPTIMIZATION: Voice Chat Module Integration --- */}
          {data?.project && (
            <VoiceChat 
              projectId={data.project._id} 
              currentUserId={(session?.user as any)?.id} 
              theme={theme} 
              isDarkMode={isDarkMode} 
            />
          )}

        </div>
      </div>

      {/* --- OPTIMIZATION: Template Preview Modal --- */}
      <AnimatePresence>
        {selectedTemplate && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setSelectedTemplate(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'}`}
            >
              {/* Modal Header & Toggle */}
              <div className="px-6 py-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 border-inherit">
                <div>
                  <h3 className="text-sm font-black tracking-tight">
                    {selectedTemplate?.title || 'Document'} Template
                  </h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">{selectedTemplate?.filename || 'LaTeX Boilerplate'}</p>
                </div>
                
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className={`flex p-1 rounded-xl w-full sm:w-auto ${isDarkMode ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
                    <button 
                      onClick={() => setPreviewMode('rendered')}
                      className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${previewMode === 'rendered' ? 'bg-white text-black shadow-sm' : 'text-neutral-500 hover:text-inherit'}`}
                    >
                      <FileText size={14} /> Rendered
                    </button>
                    <button 
                      onClick={() => setPreviewMode('code')}
                      className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${previewMode === 'code' ? (isDarkMode ? 'bg-neutral-700 text-white shadow-sm' : 'bg-white text-black shadow-sm') : 'text-neutral-500 hover:text-inherit'}`}
                    >
                      <Code size={14} /> LaTeX Code
                    </button>
                  </div>
                  <button 
                    onClick={() => setSelectedTemplate(null)} 
                    className={`p-2 rounded-full transition-colors hidden sm:block ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'}`}
                  >
                    <X size={18} className="opacity-50" />
                  </button>
                </div>
              </div>

              {/* Scrollable Viewport */}
              <div className={`flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar ${isDarkMode ? 'bg-[#0d0d0d]' : 'bg-neutral-50'}`}>
                {previewMode === 'code' ? (
                  // RAW CODE VIEW
                  <pre className={`text-xs font-mono leading-relaxed whitespace-pre-wrap ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
                    <code>{selectedTemplate?.content || '% No content available'}</code>
                  </pre>
                ) : (
                  // SIMULATED COMPILED PAPER VIEW
                  <div className="max-w-[21cm] mx-auto min-h-[29.7cm] bg-white p-8 sm:p-12 shadow-md border border-neutral-200 text-black font-serif leading-relaxed">
                    <div className="text-center space-y-6">
                      <div className="mb-12">
                        <h1 className="text-3xl font-bold mb-4 mt-12">{selectedTemplate?.title || 'Document'}</h1>
                        <p className="text-xl">{projectMembers.map((m: any) => m.name).join(', ') || 'Team Name'}</p>
                        <p className="text-md mt-4 text-neutral-500">Auto-Generated Preview</p>
                      </div>
                      <div className="text-left space-y-6 bg-neutral-50 p-6 rounded-lg border border-neutral-200">
                        <h2 className="text-xl font-bold border-b pb-2 mb-4 text-neutral-800">Preview Note</h2>
                        <p className="text-sm text-neutral-600">
                          This is a dynamic LaTeX file. Switch to the <strong>LaTeX Code</strong> tab to view and copy the raw <code>{selectedTemplate?.filename}</code> contents. Paste the copied code into your Overleaf project to compile the true document.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Animated Copy Footer */}
              <div className="p-4 border-t border-inherit bg-inherit shrink-0">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCopyTemplate}
                  className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white shadow-lg transition-colors duration-300 ${isCopied ? 'bg-emerald-500' : theme.bg}`}
                >
                  {isCopied ? (
                    <><Check size={18} /> Copied to Clipboard!</>
                  ) : (
                    <><Copy size={18} /> Copy Template Code</>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
};

export default StudentDashboard;