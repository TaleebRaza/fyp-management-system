'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut } from 'next-auth/react';
import { 
  Users, UserMinus, CheckCircle, XCircle, Send, FileText, 
  Upload, Lock, Globe, Wrench, AlertTriangle, Megaphone,
  LayoutDashboard, Loader2, LogIn, Copy, ChevronRight,
  BookOpen, Clock, Award, RefreshCw
} from 'lucide-react';
import { GlassCard, StyledInput } from '../ui/SharedUI';
import { PROGRAM_MAP } from '../../config/appSettings';
import { Timeline } from '../ui/Timeline';

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; icon: any; label: string; desc: string }> = {
  Unassigned:            { color: 'text-red-500',    bg: 'bg-red-500/10',     border: 'border-red-500/20',     icon: UserMinus,     label: 'Unassigned',       desc: 'You are not assigned to any supervisor yet.' },
  Pending:               { color: 'text-neutral-400', bg: 'bg-neutral-500/10', border: 'border-neutral-500/20', icon: Clock,         label: 'Not Submitted',    desc: 'Fill in your project details and submit to begin.' },
  'Submitted For Review':{ color: 'text-blue-500',   bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    icon: Send,          label: 'Under Review',     desc: 'Your supervisor has been notified.' },
  Approved:              { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle,   label: 'Approved',         desc: 'Congratulations! Your project has been approved.' },
  Rejected:              { color: 'text-red-500',    bg: 'bg-red-500/10',     border: 'border-red-500/20',     icon: XCircle,       label: 'Rejected',         desc: 'Your supervisor has rejected the submission.' },
  'Changes Requested':   { color: 'text-amber-500',  bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   icon: AlertTriangle, label: 'Changes Required', desc: 'Revisions have been requested. See remarks below.' },
};

const getStatus = (isUnassigned: boolean, status: string) =>
  STATUS_CONFIG[isUnassigned ? 'Unassigned' : status] ?? STATUS_CONFIG['Pending'];

// ── Stat pill ─────────────────────────────────────────────────────────────────
const StatPill = ({ label, value, isDarkMode, theme }: any) => (
  <div className={`px-4 py-2 rounded-2xl text-xs font-bold flex flex-col gap-0.5 ${isDarkMode ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
    <span className="opacity-50 uppercase tracking-wider">{label}</span>
    <span className={`${theme.text} text-sm`}>{value}</span>
  </div>
);

// ── Section header ────────────────────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, title, theme, isDarkMode }: any) => (
  <div className="flex items-center gap-3 mb-6">
    <div className={`p-2 rounded-xl ${theme.lightBg} ${theme.text}`}>
      <Icon size={18} />
    </div>
    <h3 className="text-lg font-extrabold tracking-tight">{title}</h3>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
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
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [headline, setHeadline] = useState('');
  const [copied, setCopied] = useState(false);

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

  useEffect(() => { fetchHeadline(); }, []);

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
  const canSubmit = me?.status === 'Pending' || me?.status === 'Rejected' || me?.status === 'Changes Requested';
  const statusCfg = getStatus(isUnassigned, me?.status);
  const StatusIcon = statusCfg.icon;

  const copyCode = () => {
    if (!data?.project?.inviteCode) return;
    navigator.clipboard.writeText(data.project.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoinTeam = async (e: any) => {
    e.preventDefault();
    if (!inviteCodeInput) return;
    setIsSubmitting(true);
    const res = await fetch('/api/project/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: (session?.user as any)?.id, inviteCode: inviteCodeInput })
    });
    const json = await res.json();
    if (res.ok) {
      showDialog({ title: "Success", message: "Successfully joined the team!" });
      setInviteCodeInput('');
      fetchData(); 
    } else {
      showDialog({ title: "Error", message: json.error });
    }
    setIsSubmitting(false);
  };

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

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <Loader2 className={`animate-spin ${theme.text}`} size={40} />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex flex-col gap-5 pb-10">

      {/* ── TOP HEADER BAR ───────────────────────────────────────────────────── */}
      <GlassCard isDarkMode={isDarkMode} className="!p-5 md:!p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-black shrink-0 bg-gradient-to-br ${theme.gradient}`}>
            {me?.name?.charAt(0) ?? '?'}
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight leading-tight">{me?.name}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className="font-mono text-xs opacity-60">{me?.rollNo}</span>
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg ${theme.lightBg} ${theme.text}`}>
                {me?.program ?? 'N/A'}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${isDarkMode ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-100 text-neutral-500'}`}>
                {me?.batch ?? '—'} · {me?.semester ?? '7th Sem'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className={`flex-1 sm:flex-none flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold ${isDarkMode ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
            <Award size={16} className={isUnassigned ? 'text-red-400' : theme.text} />
            <span className={isUnassigned ? 'text-red-400' : 'opacity-80'}>
              {isUnassigned ? 'No Supervisor' : supervisor?.name}
            </span>
          </div>
          <motion.button
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            onClick={() => signOut({ redirect: false })}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-bold text-sm transition-all shrink-0"
          >
            <LogIn size={16} className="rotate-180" /> Logout
          </motion.button>
        </div>
      </GlassCard>

      {/* ── ANNOUNCEMENT ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {headline && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className={`flex items-center gap-4 px-5 py-4 rounded-2xl border border-blue-500/20 ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
              <div className="p-2 rounded-xl bg-blue-500/20 text-blue-500 shrink-0">
                <Megaphone size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-0.5">Announcement</p>
                <p className="text-sm font-semibold leading-snug">{headline}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TIMELINE ─────────────────────────────────────────────────────────── */}
      {data?.student?.status !== 'Unassigned' && !isUnassigned && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <Timeline currentStage={data?.project?.stage || 'PROPOSAL'} isDarkMode={isDarkMode} theme={theme} />
        </motion.div>
      )}

      {/* ── STATS ROW — hidden on mobile, visible md+ ────────────────────────── */}
      <div className="hidden md:grid grid-cols-3 gap-3">
        <StatPill label="Program"  value={PROGRAM_MAP[me?.program]?.split(' ').slice(1).join(' ') || me?.program || 'N/A'} isDarkMode={isDarkMode} theme={theme} />
        <StatPill label="Batch"    value={me?.batch    || '—'} isDarkMode={isDarkMode} theme={theme} />
        <StatPill label="Semester" value={me?.semester || '—'} isDarkMode={isDarkMode} theme={theme} />
      </div>

      {/* ── STATUS CARD ──────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <div className={`flex items-center gap-5 p-5 rounded-2xl border ${statusCfg.bg} ${statusCfg.border}`}>
          <div className={`p-3 rounded-2xl ${isDarkMode ? 'bg-neutral-900/60' : 'bg-white/60'} shrink-0`}>
            <StatusIcon size={28} className={statusCfg.color} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-extrabold text-base ${statusCfg.color}`}>{statusCfg.label}</p>
            <p className="text-sm opacity-70 mt-0.5 leading-snug">{statusCfg.desc}</p>
            {me?.remarks && (
              <div className={`mt-3 px-4 py-3 rounded-xl text-xs font-medium italic leading-relaxed border ${isDarkMode ? 'bg-neutral-800/60 border-neutral-700 text-neutral-300' : 'bg-white/70 border-neutral-200 text-neutral-600'}`}>
                💬 "{me.remarks}"
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── MAIN CONTENT GRID ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── PROJECT FORM — order-2 on mobile, order-1 on lg ─────────────────── */}
        <GlassCard isDarkMode={isDarkMode} className="col-span-1 lg:col-span-2 !p-6 md:!p-8 order-2 lg:order-1">
          {isUnassigned ? (
            <div>
              <SectionHeader icon={Award} title="Select a Supervisor" theme={theme} isDarkMode={isDarkMode} />
              <p className="text-sm opacity-60 mb-6 leading-relaxed">
                You need a supervisor before submitting your FYP. Choose one from the list below.
              </p>
              <form onSubmit={handleAssignSupervisor} className="space-y-4 max-w-sm">
                <select name="newSup" required className={`w-full px-4 py-3.5 rounded-2xl border-2 border-transparent outline-none appearance-none font-medium text-sm transition-all ${isDarkMode ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-black'} ${theme.ring}`}>
                  <option value="">— Choose a Supervisor —</option>
                  {Array.isArray(localSups) && localSups.map(sup => (
                    <option key={sup._id} value={sup._id} disabled={sup.isFull}>
                      {sup.name} {sup.isFull ? '(Capacity Reached)' : `(${sup.filledSlots}/${sup.maxSlots} Slots)`}
                    </option>
                  ))}
                </select>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit"
                  className={`w-full ${theme.bg} text-white font-bold py-3.5 rounded-2xl shadow-lg transition-colors duration-300 flex items-center justify-center gap-2`}>
                  <ChevronRight size={18} /> Assign Supervisor
                </motion.button>
              </form>
            </div>
          ) : (
            <div>
              <SectionHeader icon={BookOpen} title="Project Details" theme={theme} isDarkMode={isDarkMode} />

              {/* Lock / warning banner */}
              <div className={`flex items-start gap-3 p-4 rounded-2xl text-sm font-medium mb-6 border ${
                canSubmit
                  ? (isDarkMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-800')
                  : (isDarkMode ? 'bg-blue-500/10  border-blue-500/20  text-blue-400'  : 'bg-blue-50  border-blue-200  text-blue-800')
              }`}>
                {canSubmit ? <AlertTriangle size={20} className="shrink-0 mt-0.5" /> : <Lock size={20} className="shrink-0 mt-0.5" />}
                <p className="leading-relaxed">
                  {canSubmit
                    ? 'A PDF is required. Once submitted your project is locked until your supervisor reviews it.'
                    : `Project is ${me?.status?.toLowerCase()}. Only editable if your supervisor rejects or requests changes.`}
                </p>
              </div>

              <form onSubmit={handleSubmitProject} className="space-y-5">
                {/* Changes Requested remarks */}
                {me?.status === 'Changes Requested' && me?.remarks && (
                  <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    <h4 className="font-bold flex items-center gap-2 mb-2"><CheckCircle size={18}/> Revisions Required</h4>
                    <p className="text-sm font-medium opacity-80 italic">"{me.remarks}"</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2 pl-1">Project Title</label>
                  <StyledInput isDarkMode={isDarkMode} theme={theme} disabled={!canSubmit} value={title} onChange={(e:any) => setTitle(e.target.value)} required type="text" placeholder="e.g. AI Based Disease Predictor" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2 pl-1">Domain</label>
                    <StyledInput isDarkMode={isDarkMode} theme={theme} disabled={!canSubmit} icon={Globe} value={domain} onChange={(e:any) => setDomain(e.target.value)} required type="text" placeholder="e.g. Machine Learning" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2 pl-1">Tools & Stack</label>
                    <StyledInput isDarkMode={isDarkMode} theme={theme} disabled={!canSubmit} icon={Wrench} value={tools} onChange={(e:any) => setTools(e.target.value)} required type="text" placeholder="e.g. Next.js, Python" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2 pl-1">Description</label>
                  <textarea
                    disabled={!canSubmit} value={desc} onChange={(e:any) => setDesc(e.target.value)}
                    required rows={4}
                    placeholder="Briefly describe your core objectives..."
                    className={`w-full px-4 py-3.5 rounded-2xl border-2 border-transparent outline-none resize-none text-sm transition-all duration-300 ${isDarkMode ? 'bg-neutral-800 text-white placeholder-neutral-500' : 'bg-neutral-100 text-black placeholder-neutral-400'} ${!canSubmit ? 'opacity-50 cursor-not-allowed' : `${theme.ring} focus:bg-transparent`}`}
                  />
                </div>

                {/* PDF upload */}
                <div className={`relative rounded-2xl border-2 border-dashed transition-all duration-300 overflow-hidden ${
                  !canSubmit ? 'opacity-60 cursor-not-allowed' : `hover:${theme.border}`
                } ${isDarkMode ? 'border-neutral-700 bg-neutral-800/40' : 'border-neutral-300 bg-neutral-50'}`}>
                  <div className="flex items-center gap-4 p-5">
                    <div className={`p-3 rounded-2xl shrink-0 transition-colors duration-300 ${file ? theme.lightBg : (isDarkMode ? 'bg-neutral-700' : 'bg-neutral-200')}`}>
                      <FileText size={24} className={file ? theme.text : 'opacity-40'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{file ? file.name : 'Upload PDF Document'}</p>
                      <p className="text-xs opacity-50 mt-0.5">{file ? 'Ready to submit' : 'Click or drag & drop your proposal'}</p>
                    </div>
                    {canSubmit && (
                      <span className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-colors duration-300 ${file ? `${theme.lightBg} ${theme.text}` : (isDarkMode ? 'bg-neutral-700 text-white' : 'bg-neutral-200 text-black')}`}>
                        {file ? 'Change' : 'Browse'}
                      </span>
                    )}
                  </div>
                  <input disabled={!canSubmit} type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className={`absolute inset-0 w-full h-full opacity-0 ${canSubmit ? 'cursor-pointer' : 'cursor-not-allowed'}`} title={canSubmit ? "Select a PDF" : "Locked"} />
                </div>

                {me?.pdfUrl && !file && (
                  <p className="text-xs text-emerald-500 font-semibold flex items-center gap-1.5 pl-1">
                    <CheckCircle size={14} /> Active PDF on file. {canSubmit ? "Submitting a new file will overwrite it." : "Your file is locked for review."}
                  </p>
                )}

                {canSubmit && (
                  <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} disabled={isSubmitting} type="submit"
                    className={`w-full ${theme.bg} disabled:opacity-50 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-base transition-colors duration-300 shadow-lg`}>
                    {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    {isSubmitting ? 'Uploading Securely...' : 'Submit Project'}
                  </motion.button>
                )}
              </form>
            </div>
          )}
        </GlassCard>

        {/* ── RIGHT COLUMN — order-1 on mobile, order-2 on lg ─────────────────── */}
        <div className="col-span-1 flex flex-col gap-5 order-1 lg:order-2">

          {/* Team Card */}
          <GlassCard isDarkMode={isDarkMode} className="!p-5 md:!p-6">
            <SectionHeader icon={Users} title="My Team" theme={theme} isDarkMode={isDarkMode} />

            {data?.project ? (
              <div className="space-y-5">
                {/* Invite code — tap to copy */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">Invite Code</p>
                  <button
                    onClick={copyCode}
                    className={`w-full flex items-center justify-between gap-3 p-4 rounded-2xl border-2 border-dashed font-mono text-lg tracking-widest font-bold transition-all ${
                      copied
                        ? `${theme.border} ${theme.lightBg} ${theme.text}`
                        : isDarkMode ? 'border-neutral-700 bg-neutral-800/60 hover:border-neutral-500' : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400'
                    }`}
                  >
                    <span>{data.project.inviteCode}</span>
                    {copied ? <CheckCircle size={18} className={theme.text} /> : <Copy size={16} className="opacity-40" />}
                  </button>
                  <p className="text-[10px] opacity-40 mt-1.5 text-center">
                    {copied ? 'Copied to clipboard!' : 'Tap to copy and share with your partner'}
                  </p>
                </div>

                {/* Members */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Members</p>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${theme.lightBg} ${theme.text}`}>
                      {data.project.members.length} / 2
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {data.project.members.map((member: any) => (
                      <li key={member._id} className={`flex items-center gap-3 p-3 rounded-2xl border ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-neutral-50 border-neutral-200'}`}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm text-white bg-gradient-to-br ${theme.gradient} shrink-0`}>
                          {member.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm leading-tight truncate">{member.name}</p>
                          <p className="font-mono text-[10px] opacity-50 mt-0.5">{member.rollNo}</p>
                        </div>
                      </li>
                    ))}
                    {/* Empty slot */}
                    {data.project.members.length < 2 && (
                      <li className={`flex items-center gap-3 p-3 rounded-2xl border border-dashed ${isDarkMode ? 'border-neutral-700' : 'border-neutral-300'}`}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
                          <Users size={16} className="opacity-30" />
                        </div>
                        <p className="text-xs opacity-40 italic">Waiting for partner…</p>
                      </li>
                    )}
                  </ul>
                </div>

                {/* Join team */}
                {data.project.members.length < 2 && (
                  <form onSubmit={handleJoinTeam} className={`pt-4 border-t ${isDarkMode ? 'border-neutral-800' : 'border-neutral-200'}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-3">Join a Team</p>
                    <div className="flex gap-2">
                      <input
                        type="text" required placeholder="Paste code here"
                        value={inviteCodeInput}
                        onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                        className={`flex-1 px-4 py-3 rounded-xl border-2 border-transparent outline-none font-mono uppercase text-sm transition-all ${isDarkMode ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-black'} ${theme.ring}`}
                      />
                      <button type="submit" disabled={isSubmitting} className={`px-5 py-3 rounded-xl text-white font-bold transition-all active:scale-95 shrink-0 ${theme.bg}`}>
                        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Join'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 opacity-40 py-4">
                <RefreshCw size={16} className="animate-spin" />
                <span className="text-sm">Loading team…</span>
              </div>
            )}
          </GlassCard>

          {/* Supervisor card */}
          {!isUnassigned && supervisor && (
            <GlassCard isDarkMode={isDarkMode} className="!p-6">
              <SectionHeader icon={Award} title="Supervisor" theme={theme} isDarkMode={isDarkMode} />
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg text-white bg-gradient-to-br ${theme.gradient} shrink-0`}>
                  {supervisor.name?.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-extrabold text-base leading-tight truncate">{supervisor.name}</p>
                  <p className="text-xs opacity-50 mt-0.5 font-mono">{supervisor.rollNo}</p>
                </div>
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default StudentDashboard;