'use client';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { signOut } from 'next-auth/react';
import { 
  Users, UserMinus, CheckCircle, XCircle, Send, FileText, 
  Upload, Lock, Globe, Wrench, AlertTriangle, 
  LayoutDashboard, Loader2, LogIn 
} from 'lucide-react';
import { GlassCard, StyledInput } from '../ui/SharedUI';

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

  // --- NEW TEAM STATE ---
  const [inviteCodeInput, setInviteCodeInput] = useState('');

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
      fetchData(); // Refresh to show new team members
    } else {
      showDialog({ title: "Error", message: json.error });
    }
    setIsSubmitting(false);
  };
  // ----------------------

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
                    {Array.isArray(localSups) && localSups.map(sup => (
                      <option key={sup._id} value={sup._id} disabled={sup.isFull}>
                        {sup.name} {sup.isFull ? '(Capacity Reached)' : `(${sup.filledSlots}/${sup.maxSlots} Slots)`}
                      </option>
                    ))}
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

        <div className="col-span-1 flex flex-col gap-6">
          {/* --- NEW TEAM CARD --- */}
          <GlassCard isDarkMode={isDarkMode} className="p-8 flex flex-col">
            <h3 className="text-xl font-extrabold tracking-tight mb-6 flex items-center gap-3">
              <div className={`p-2 rounded-xl ${theme.lightBg} ${theme.text}`}><Users size={20} /></div> 
              My Team
            </h3>
            
            {data?.project ? (
              <div>
                <p className="text-sm font-bold opacity-60 mb-2 uppercase tracking-wider">Team Invite Code</p>
                <div className={`font-mono text-xl tracking-widest p-4 rounded-2xl mb-6 text-center border-2 border-dashed ${isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-neutral-100 border-neutral-300 text-black'}`}>
                  {data.project.inviteCode}
                </div>
                
                <p className="text-sm font-bold opacity-60 mb-3 uppercase tracking-wider flex justify-between">
                  <span>Members</span>
                  <span>{data.project.members.length} / 2</span>
                </p>
                
                <ul className="space-y-3 mb-6">
                  {data.project.members.map((member: any) => (
                    <li key={member._id} className={`p-3 rounded-2xl flex items-center gap-3 border shadow-sm ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-200'}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white bg-gradient-to-br ${theme.gradient}`}>
                        {member.name.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm leading-none mb-1">{member.name}</span>
                        <span className="text-[10px] opacity-60 font-mono leading-none">{member.rollNo}</span>
                      </div>
                    </li>
                  ))}
                </ul>

                {data.project.members.length < 2 && (
                   <form onSubmit={handleJoinTeam} className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
                     <p className="text-sm font-bold opacity-60 mb-3 uppercase tracking-wider">Join Existing Team</p>
                     <div className="flex gap-2">
                       <input
                         type="text"
                         required
                         placeholder="Paste Code Here"
                         value={inviteCodeInput}
                         onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                         className={`flex-1 px-4 py-3 rounded-xl border-2 border-transparent transition-all outline-none font-mono uppercase text-sm ${isDarkMode ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-black'} ${theme.ring}`}
                       />
                       <button type="submit" disabled={isSubmitting} className={`px-5 py-3 rounded-xl text-white font-bold transition-all shadow-md active:scale-95 ${theme.bg}`}>
                          Join
                       </button>
                     </div>
                   </form>
                )}
              </div>
            ) : (
              <p className="opacity-50 text-sm italic">Loading team data...</p>
            )}
          </GlassCard>

          {/* --- EXISTING LIVE STATUS CARD --- */}
          <GlassCard isDarkMode={isDarkMode} className="p-8 flex flex-col h-full">
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
      </div>
    </motion.div>
  );
};

export default StudentDashboard;