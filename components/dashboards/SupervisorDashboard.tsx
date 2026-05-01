'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut } from 'next-auth/react';
import { XCircle, Globe, Wrench, FileText, ArrowRightLeft, UserMinus, LayoutDashboard, Download, LogIn, Loader2, ChevronRight } from 'lucide-react';
import { GlassCard } from '../ui/SharedUI';
import { Timeline } from '../ui/Timeline';


const SupervisorDashboard = ({ isDarkMode, theme, session, showDialog }: any) => {
  const [myProjects, setMyProjects] = useState<any[]>([]);
  const [migrationInput, setMigrationInput] = useState<Record<string, string>>({});
  const [myMigrationCode, setMyMigrationCode] = useState<string>("Loading...");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const fetchProjects = async () => {
    const res = await fetch(`/api/dashboard/supervisor?id=${(session?.user as any)?.id}`);
    const json = await res.json();
    setMyProjects(Array.isArray(json.projects) ? json.projects : []);
    try {
      const supRes = await fetch('/api/supervisors');
      const supData = await supRes.json();
      const sups = Array.isArray(supData) ? supData : [];
      const me = sups.find((s: any) => s.rollNo === (session?.user as any)?.rollNo);
      if (me) setMyMigrationCode(me.migrationCode || "N/A");
    } catch (err) { setMyMigrationCode("Error"); }
    setIsLoading(false);
  };
  useEffect(() => { fetchProjects(); }, []);

  const handleAction = async (triggerStudentId: string, newStatus: string) => {
    showDialog({
      type: 'prompt', title: `${newStatus} Project`, message: `Add optional remarks for marking this team's project as ${newStatus}:`,
      onConfirm: async (remarks: string) => {
        setIsProcessingAction(true); // START SPINNER
        try {
          const res = await fetch('/api/dashboard/supervisor', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ action: 'updateStatus', studentId: triggerStudentId, status: newStatus, remarks: remarks || "No remarks provided." }) 
          });
          
          if (!res.ok) throw new Error("Server failed to process the request.");
          
          setSelectedProject(null); 
          fetchProjects(); 
        } catch (error) {
          showDialog({ title: "Network Error", message: "Failed to send suggestions. Please ensure you have a stable connection and try again." });
        } finally {
          setIsProcessingAction(false); // STOP SPINNER
        }
      }
    });
  };
  const handleMigrate = async (triggerStudentId: string, projectId: string) => {
    const code = migrationInput[projectId];
    if (!code) { showDialog({ title: "Input Required", message: "Please enter a Migration Code." }); return; }
    const res = await fetch('/api/dashboard/supervisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'migrate', studentId: triggerStudentId, migrationCode: code }) });
    if (res.ok) { showDialog({ title: "Success", message: "Team migrated!" }); setSelectedProject(null); fetchProjects(); } 
    else { showDialog({ title: "Error", message: "Invalid Migration Code." }); }
  };

  const handleRemoveTeam = (triggerStudentId: string, teamNames: string) => {
    showDialog({
      type: 'confirm', title: 'Remove Team?', message: `Are you sure you want to remove ${teamNames} from your list? They will have to select a new supervisor.`,
      onConfirm: async () => {
        await fetch('/api/dashboard/supervisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'removeStudent', studentId: triggerStudentId }) });
        setSelectedProject(null); fetchProjects();
      }
    });
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const id   = (session?.user as any)?.id;
      const name = session?.user?.name || 'Supervisor';
      const response = await fetch(`/api/export-pdf?id=${id}&name=${encodeURIComponent(name)}`);
      if (!response.ok) throw new Error(`Export failed. Server responded with status: ${response.status}`);
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('Received an empty file from the server.');
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fyp-report-${name.replace(/\s+/g, '-')}.xlsx`; 
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      showDialog({ title: 'Export Failed', message: err.message || 'An unexpected error occurred.' });
    } finally {
      setTimeout(() => setIsExporting(false), 1000);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-[80vh]"><Loader2 className={`animate-spin ${theme.text}`} size={40}/></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6 min-h-[80vh] relative">
      <AnimatePresence>
        {selectedProject && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedProject(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 rounded-[2rem] border shadow-2xl backdrop-blur-3xl custom-scrollbar ${isDarkMode ? 'bg-[#18181b]/95 border-white/10 text-white' : 'bg-white/95 border-neutral-200/50 text-black'}`}
            >
              <button onClick={() => setSelectedProject(null)} className="absolute top-6 right-6 p-2 rounded-full hover:bg-neutral-500/20 transition-colors z-10"><XCircle size={24} className="opacity-60" /></button>
              <div className="mb-6 border-b border-neutral-200 dark:border-neutral-800 pb-6 pr-12">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-3xl font-extrabold tracking-tight mb-1">{selectedProject.members.map((m:any) => m.name).join(' & ')}</h2>
                    <p className="font-mono opacity-60 font-medium">{selectedProject.members.map((m:any) => m.rollNo).join(' | ')}</p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-xl ${selectedProject.status === 'Approved' ? (isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-700') : selectedProject.status === 'Rejected' ? (isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-100 text-red-700') : (isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-700')}`}>{selectedProject.status}</span>
                </div>
              </div>

              <Timeline 
                currentStage={selectedProject.stage || 'PROPOSAL'} 
                isDarkMode={isDarkMode} 
                theme={theme} 
              />

              {selectedProject.projectTitle ? (
                <div className={`p-6 rounded-2xl mb-8 ${isDarkMode ? 'bg-black/20' : 'bg-neutral-50'} shadow-inner`}>
                  <h3 className="text-xl font-bold mb-4">{selectedProject.projectTitle}</h3>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {selectedProject.domain && <span className={`text-xs px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider flex items-center gap-1.5 ${theme.lightBg} ${theme.text}`}><Globe size={14}/> {selectedProject.domain}</span>}
                    {selectedProject.tools && <span className={`text-xs px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDarkMode ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-200 text-neutral-600'} line-clamp-1`}><Wrench size={14}/> {selectedProject.tools}</span>}
                  </div>
                  <p className="text-sm opacity-80 leading-relaxed mb-6">{selectedProject.projectDesc}</p>
                  {selectedProject.pdfUrl ? (
                    <a href={`/api/read-pdf?url=${encodeURIComponent(selectedProject.pdfUrl)}`} target="_blank" rel="noreferrer" className={`text-sm px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold w-fit transition-colors duration-300 ${theme.bg} text-white shadow-md hover:scale-[1.02] active:scale-95`}>
                      <FileText size={16}/> View Complete PDF Document
                    </a>
                  ) : <span className={`text-sm px-4 py-2 rounded-xl flex items-center gap-2 font-bold w-fit opacity-70 ${isDarkMode ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-200 text-neutral-600'}`}>No PDF Attached</span>}
                </div>
              ) : <div className={`mb-8 text-center p-8 rounded-2xl ${isDarkMode ? 'bg-neutral-800/50' : 'bg-neutral-100'}`}><FileText size={40} className="mx-auto mb-3 opacity-20" /><p className="font-bold opacity-50">Project details have not been submitted yet.</p></div>}
              
              <div>
                <h4 className="font-extrabold text-sm tracking-widest uppercase opacity-40 mb-4">Supervisor Actions</h4>
                <div className="space-y-4">
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <motion.button 
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} 
                      onClick={() => handleAction(selectedProject.triggerStudentId, 'Approved')} 
                      disabled={!selectedProject.projectTitle || selectedProject.status === 'Approved' || isProcessingAction} 
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl text-sm font-bold shadow-md flex items-center justify-center gap-2"
                    >
                      {isProcessingAction ? <><Loader2 size={18} className="animate-spin" /> Processing...</> : "Approve Project"}
                    </motion.button>
                    
                    <motion.button 
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} 
                      onClick={() => handleAction(selectedProject.triggerStudentId, 'Changes Requested')} 
                      disabled={!selectedProject.projectTitle || selectedProject.status === 'Changes Requested' || isProcessingAction} 
                      className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl text-sm font-bold shadow-md flex items-center justify-center gap-2"
                    >
                      {isProcessingAction ? <><Loader2 size={18} className="animate-spin" /> Processing...</> : "Make Suggestion"}
                    </motion.button>

                    <motion.button 
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} 
                      onClick={() => handleAction(selectedProject.triggerStudentId, 'Rejected')} 
                      disabled={!selectedProject.projectTitle || selectedProject.status === 'Rejected' || isProcessingAction} 
                      className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl text-sm font-bold shadow-md flex items-center justify-center gap-2"
                    >
                      {isProcessingAction ? <><Loader2 size={18} className="animate-spin" /> Processing...</> : "Reject Project"}
                    </motion.button>
                  </div>

                  <div className="flex gap-3 items-center">
                    <div className={`flex-1 flex items-center p-2 rounded-xl border focus-within:border-blue-500 ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'}`}>
                      <input placeholder="Enter target Migration Code..." className="w-full bg-transparent px-3 text-sm focus:outline-none uppercase font-mono font-medium" onChange={(e) => setMigrationInput({...migrationInput, [selectedProject._id]: e.target.value.toUpperCase()})} />
                      <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleMigrate(selectedProject.triggerStudentId, selectedProject._id)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${theme.bg} text-white`}><ArrowRightLeft size={14}/> Migrate</motion.button>
                    </div>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleRemoveTeam(selectedProject.triggerStudentId, selectedProject.members.map((m:any) => m.name).join(' & '))} title="Remove Team" className="p-3.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors border border-transparent hover:border-red-500 flex items-center justify-center shadow-sm"><UserMinus size={20}/></motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <GlassCard isDarkMode={isDarkMode} className="w-full flex flex-col md:flex-row justify-between items-start md:items-center p-6 md:px-8 gap-5">
        <div className="w-full">
          <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-3">
            <div className={`p-2 rounded-xl ${theme.lightBg} ${theme.text} transition-colors duration-500`}><LayoutDashboard size={20} /></div> Supervisor Panel
          </h2>
          <div className="font-medium opacity-60 mt-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span>Welcome, {session?.user?.name}</span><span className="hidden sm:block opacity-40 text-sm">|</span>
            <span>Your Code: <span className={`font-mono px-2 py-0.5 rounded-md ${theme.lightBg} ${theme.text}`}>{myMigrationCode}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-neutral-200 dark:border-neutral-800 transition-colors">
          <motion.button whileHover={{ scale: isExporting ? 1 : 1.05 }} whileTap={{ scale: isExporting ? 1 : 0.95 }} onClick={handleExportPDF} disabled={isExporting} className={`flex-1 md:flex-none justify-center flex items-center gap-2 px-3 sm:px-5 py-2.5 rounded-2xl font-bold text-sm sm:text-base transition-all ${isExporting ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'} ${theme.bg} text-white shadow-md`}>
            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} <span className="whitespace-nowrap">{isExporting ? 'Downloading...' : 'Export Excel'}</span>
          </motion.button>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => signOut({ redirect: false })} className={`flex-1 md:flex-none justify-center bg-red-500/10 hover:bg-red-500 ${isDarkMode ? 'text-red-400' : 'text-red-600'} hover:text-white px-3 sm:px-6 py-2.5 rounded-2xl transition-all font-bold text-sm sm:text-base flex items-center gap-2`}><LogIn size={20} className="rotate-180" /> <span className="whitespace-nowrap">Logout</span></motion.button>
        </div>
      </GlassCard>

      <GlassCard isDarkMode={isDarkMode} className="flex-1 p-8">
        <h3 className="text-xl font-extrabold tracking-tight mb-8">My Assigned Projects <span className={`text-sm font-medium px-2 py-1 rounded-lg ml-2 ${theme.lightBg} ${theme.text}`}>{myProjects.length}</span></h3>
        {myProjects.length === 0 ? (
           <div className="text-center py-20 opacity-40 border-2 border-dashed rounded-3xl dark:border-neutral-700 font-medium">No projects assigned to you yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {myProjects.map(project => (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ scale: 1.02, y: -4 }} whileTap={{ scale: 0.98 }} onClick={() => setSelectedProject(project)} key={project._id} className={`cursor-pointer p-6 rounded-[2rem] border flex flex-col justify-between transition-all duration-300 hover:shadow-xl ${isDarkMode ? 'bg-neutral-800/50 border-neutral-700/50 hover:border-neutral-600' : 'bg-neutral-50/50 border-neutral-200/50 hover:border-neutral-300'}`}>
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-extrabold text-lg tracking-tight line-clamp-1 pr-2">{project.members.map((m:any) => m.name).join(' & ')}</h4>
                        <p className="text-xs font-mono font-medium opacity-50">{project.members.map((m:any) => m.rollNo).join(' | ')}</p>
                      </div>
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-lg shrink-0 ${project.status === 'Approved' ? (isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-700') : project.status === 'Rejected' ? (isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-100 text-red-700') : (isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-700')}`}>{project.status}</span>
                    </div>
                    {project.projectTitle ? (
                      <div className="mb-2">
                        <p className="text-sm font-bold tracking-tight line-clamp-1">{project.projectTitle}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {project.domain && <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${theme.lightBg} ${theme.text} line-clamp-1`}><Globe size={10} className="inline mr-1 mb-0.5"/>{project.domain}</span>}
                          {project.tools && <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${isDarkMode ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-200 text-neutral-600'} line-clamp-1`}><Wrench size={10} className="inline mr-1 mb-0.5"/>{project.tools}</span>}
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


export default SupervisorDashboard;