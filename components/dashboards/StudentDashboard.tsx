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
  FileText, 
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
  ExternalLink,
  Info
} from 'lucide-react';
import { GlassCard, StyledInput } from '../ui/SharedUI';
import { Timeline } from '../ui/Timeline';

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
      const formData = new FormData();
      formData.append('file', file);
      try {
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        if (uploadRes.ok) {
          const uploadJson = await uploadRes.json();
          pdfUrl = uploadJson.url;
        } else {
          showDialog({ title: "Upload Failed", message: "Could not upload the PDF file." });
          setIsSubmitting(false);
          return;
        }
      } catch (err) {
        showDialog({ title: "Network Error", message: "File upload failed." });
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
          pdfUrl 
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
      
      {/* 1. COMPACT HEADER SECTION */}
      <GlassCard isDarkMode={isDarkMode} className="w-full p-3 md:px-8 md:py-6 relative overflow-hidden">
        <div className={`absolute top-0 right-0 w-32 h-32 blur-[80px] rounded-full opacity-10 ${theme.bg}`} />
        
        <div className="flex justify-between items-center mb-3">
          <div className="flex flex-col">
            <h2 className="text-lg md:text-3xl font-black tracking-tight leading-none">
              Hi, {me?.name?.split(' ')[0]}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-mono font-bold opacity-40 uppercase">{me?.rollNo}</span>
              <span className="w-1 h-1 rounded-full bg-neutral-500/30" />
              <span className={`text-[9px] font-black uppercase ${theme.text}`}>{me?.program}</span>
            </div>
          </div>

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }} 
            onClick={() => signOut({ redirect: false })} 
            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white p-2 md:px-5 md:py-2.5 rounded-xl transition-all text-xs font-bold"
          >
            <LogIn size={16} className="rotate-180" /> 
            <span className="hidden md:inline">Logout</span>
          </motion.button>
        </div>

        <div className="flex items-center justify-between border-t border-neutral-500/10 pt-3">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[8px] font-black opacity-30 uppercase tracking-widest">Batch</span>
              <span className="text-[11px] font-bold">{me?.batch || '202X'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] font-black opacity-30 uppercase tracking-widest">Semester</span>
              <span className="text-[11px] font-bold">{me?.semester || 'N/A'}</span>
            </div>
          </div>
          
          <div className="text-right">
             <span className="text-[8px] font-black opacity-30 uppercase tracking-widest block">Supervisor</span>
             <span className={`text-[11px] font-black ${isUnassigned ? 'text-red-500' : theme.text}`}>
               {isUnassigned ? 'NOT ASSIGNED' : supervisor?.name?.split(' ')[0]}
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

      {/* 3. ANNOUNCEMENT BAR (MODIFIED) */}
      <AnimatePresence>
        {headline && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <GlassCard isDarkMode={isDarkMode} className="p-3 border-l-4 border-l-blue-500 flex items-center gap-3 bg-blue-500/5 overflow-hidden">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 shrink-0 flex items-center gap-2">
                <Megaphone size={14} />
                <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest">Announcement</span>
              </div>
              
              {/* Marquee for small screens only */}
              <div className="block md:hidden flex-1 overflow-hidden">
                <p className="text-xs font-bold text-blue-500 truncate">
                  {headline}
                </p>
              </div>

              {/* Static Text for big screens */}
              <div className="hidden md:block flex-1">
                <p className="text-xs font-bold text-blue-500">
                  {headline}
                </p>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

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
                <p className="text-xs opacity-50 mb-6 max-w-xs mx-auto">Please select an available supervisor to begin your Final Year Project journey.</p>
                
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
                    <a href={me.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] font-black text-blue-500 hover:underline">
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
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-500/10">
                <div className="flex items-center gap-2">
                  <Users size={16} className={theme.text} />
                  <h3 className="font-black text-[10px] uppercase">My Team</h3>
                </div>
                <div className="px-2 py-0.5 rounded-full bg-neutral-500/10 text-[9px] font-black">
                 {projectMembers.length}/2
                </div>
            </div>

            {data?.project ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  {projectMembers.map((member: any) => (
                    <div key={member._id} className="flex items-center justify-between p-2 rounded-xl bg-neutral-500/5">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white bg-gradient-to-br ${theme.gradient} shrink-0`}>
                          {member.name.charAt(0)}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-[10px] font-black truncate">{member.name}</span>
                          <span className="text-[8px] opacity-40 font-mono">{member.rollNo}</span>
                        </div>
                      </div>
                      {member.rollNo === me.rollNo && (
                         <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
                      )}
                    </div>
                  ))}
                </div>

                {projectMembers.length < 2 && (
                  <div className="space-y-3 pt-2">
                    <form onSubmit={handleJoinTeam} className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Invite Code" 
                        value={inviteCodeInput}
                        onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                        className={`flex-1 px-3 py-2.5 text-[10px] rounded-xl outline-none font-mono font-black ${isDarkMode ? 'bg-neutral-900' : 'bg-neutral-100'} border-2 border-transparent focus:border-blue-500/30 transition-all`}
                      />
                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        type="submit" 
                        className={`px-4 py-2.5 rounded-xl text-[10px] font-black text-white shadow-lg ${theme.bg}`}
                      >
                        JOIN
                      </motion.button>
                    </form>
                  </div>
                )}
                
                <div className={`mt-2 p-3 rounded-2xl border-2 border-dotted ${isDarkMode ? 'border-neutral-800 bg-neutral-900/50' : 'border-neutral-100 bg-neutral-50/50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[8px] font-black opacity-30 uppercase tracking-tighter">Your Code</p>
                      <p className="text-xs font-mono font-black tracking-widest text-blue-500">{data.project.inviteCode || '---'}</p>
                    </div>
                    <ClipboardCheck size={14} className="opacity-20" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center opacity-20">
                <Users size={20} className="mx-auto mb-1" />
                <p className="text-[9px] font-black uppercase">No Team</p>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </motion.div>
  );
};

export default StudentDashboard;