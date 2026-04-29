'use client';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut } from 'next-auth/react';
import { Users, XCircle, Trash2, CheckCircle, User, LayoutDashboard, LogIn, PlusCircle, Code, Mail, MailX, Loader2, Megaphone, Filter } from 'lucide-react';
import { GlassCard, StyledInput } from '../ui/SharedUI';
import { PROGRAM_MAP } from '../../config/appSettings';

// --- COMPLEX ConnectionLines (with curved paths and arrow markers) ---
const ConnectionLines = ({ students, isDarkMode, theme }: any) => {
  const [lines, setLines] = useState<any[]>([]);
  const containerRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const updateLines = () => {
      if (!containerRef.current) return;
      const svgRect = containerRef.current.getBoundingClientRect();
      const newLines: any[] = [];

      students.forEach((student: any) => {
        if (!student.supervisorId) return;

        const stuEl = document.getElementById(`stu-${student._id}`);
        const supEl = document.getElementById(`sup-${student.supervisorId}`);

        if (stuEl && supEl) {
          const stuRect = stuEl.getBoundingClientRect();
          const supRect = supEl.getBoundingClientRect();

          // Start at the right edge of the supervisor pill
          const startX = supRect.right - svgRect.left;
          const startY = supRect.top - svgRect.top + supRect.height / 2;

          // End at the left edge of the student pill
          const endX = stuRect.left - svgRect.left;
          const endY = stuRect.top - svgRect.top + stuRect.height / 2;

          // Bezier control points for an S-curve
          const cp1X = startX + 60;
          const cp1Y = startY;
          const cp2X = endX - 60;
          const cp2Y = endY;

          newLines.push({
            id: student._id,
            d: `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`,
            isActive: student.isActive
          });
        }
      });
      setLines(newLines);
    };

    const timer = setTimeout(updateLines, 50);
    window.addEventListener('resize', updateLines);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateLines);
    };
  }, [students]);

  return (
    <svg ref={containerRef} className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" opacity="0.6" />
        </marker>
      </defs>
      {lines.map(line => (
        <path
          key={line.id}
          d={line.d}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray="6 6"
          className={`transition-all duration-700 ${line.isActive === false ? 'opacity-10 text-red-500' : `opacity-40 ${theme.text}`}`}
          markerEnd="url(#arrowhead)"
        />
      ))}
    </svg>
  );
};

const AdminDashboard = ({ isDarkMode, theme, session, showDialog }: any) => {
  const [activeTab, setActiveTab] = useState<'supervisors' | 'students'>('supervisors');
  const [newSupName, setNewSupName] = useState('');
  const [newSupEmail, setNewSupEmail] = useState('');
  const [newSupRollNo, setNewSupRollNo] = useState('');
  const [newSupPassword, setNewSupPassword] = useState('');
  const [adminSupervisors, setAdminSupervisors] = useState<any[]>([]);
  const [adminStudents, setAdminStudents] = useState<any[]>([]);

  // New headline & filter states
  const [headlineInput, setHeadlineInput] = useState('');
  const [currentHeadline, setCurrentHeadline] = useState('');
  const [studentFilter, setStudentFilter] = useState('All');
  const filterOptions = ['All', ...Object.keys(PROGRAM_MAP), 'Approved', 'Pending', 'Unassigned'];

  // Graph Modal
  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false);
  const [graphData, setGraphData] = useState({ supervisors: [], students: [] });
  const [isGraphLoading, setIsGraphLoading] = useState(false);

  // Filtered students
  const filteredStudents = adminStudents.filter(student => {
    if (studentFilter === 'All') return true;
    if (['BSCS', 'BSAI', 'BSTN', 'BSSE'].includes(studentFilter)) return student.program === studentFilter;
    return student.status === studentFilter;
  });

  const fetchHeadline = async () => {
    try {
      const res = await fetch('/api/headline');
      const data = await res.json();
      if (data.headline) setCurrentHeadline(data.headline.text);
    } catch (err) { console.error(err); }
  };

  const handleBroadcastHeadline = async (e: any) => {
    e.preventDefault();
    const res = await fetch('/api/headline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: headlineInput })
    });
    if (res.ok) {
      showDialog({ title: "Success", message: "Headline broadcasted to all students!" });
      setHeadlineInput('');
      fetchHeadline();
    } else {
      showDialog({ title: "Error", message: "Failed to update headline." });
    }
  };

  const clearHeadline = async () => {
    // Send empty string to clear the headline
    const res = await fetch('/api/admin/headline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' })
    });
    if (res.ok) {
      showDialog({ title: "Cleared", message: "Headline removed." });
      fetchHeadline();
    } else {
      showDialog({ title: "Error", message: "Failed to clear headline." });
    }
  };

  // Existing graph & CRUD functions (keep exactly as original)
  const openGraphModal = async () => {
    setIsGraphModalOpen(true);
    setIsGraphLoading(true);
    try {
      const res = await fetch('/api/admin/graph-data');
      const data = await res.json();
      setGraphData(data);
    } catch (err) { console.error("Failed to load graph data", err); }
    finally { setIsGraphLoading(false); }
  };

  const handleToggleStudentStatus = async (studentId: string, currentStatus: boolean) => {
    const res = await fetch('/api/admin/toggle-student', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, isActive: !currentStatus })
    });
    if (res.ok) { openGraphModal(); fetchStudents(); }
    else { showDialog({ title: "Error", message: "Failed to update student status." }); }
  };

  const fetchSupervisors = () => fetch('/api/supervisors').then(res => res.json()).then(data => setAdminSupervisors(Array.isArray(data) ? data : [])).catch(console.error);
  
  const fetchStudents = async () => {
    try {
      const res = await fetch('/api/admin/students');
      const data = await res.json();
      setAdminStudents(Array.isArray(data.students) ? data.students : []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    fetchSupervisors();
    fetchStudents();
    fetchHeadline();
  }, []);

  const handleUpdateEmail = async (userId: string, currentEmail: string, name: string) => {
    const newEmail = window.prompt(`Enter new email for ${name}:`, currentEmail || '');
    if (!newEmail || newEmail === currentEmail) return;
    const res = await fetch('/api/admin/update-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: userId, newEmail })
    });
    if (res.ok) { showDialog({ title: "Success", message: "Email updated!" }); fetchSupervisors(); fetchStudents(); }
    else { showDialog({ title: "Error", message: "Failed to update email." }); }
  };

  const handleUpdateProgram = async (userId: string, currentProgram: string, name: string) => {
    const newProgram = window.prompt(`Enter new program for ${name} (BSCS, BSAI, BSTN, BSSE):`, currentProgram || 'BSCS');
    if (!newProgram || newProgram === currentProgram) return;
    
    const uppercaseProgram = newProgram.toUpperCase();
    if (!Object.keys(PROGRAM_MAP).includes(uppercaseProgram)) {
      showDialog({ title: "Invalid Input", message: `Program must be one of: ${Object.keys(PROGRAM_MAP).join(', ')}` });
      return;
    }

    showDialog({
      type: 'confirm', 
      title: 'Warning: Team Reset', 
      message: `Changing ${name}'s program to ${uppercaseProgram} will remove them from their current team and unassign their supervisor. Proceed?`,
      onConfirm: async () => {
        const res = await fetch('/api/admin/update-program', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: userId, newProgram: uppercaseProgram })
        });
        if (res.ok) {
          showDialog({ title: "Success", message: "Program updated and student reset!" });
          fetchStudents();
        } else {
          showDialog({ title: "Error", message: "Failed to update program." });
        }
      }
    });
  };

  const handleAddSupervisor = async (e: any) => {
    e.preventDefault();
    const res = await fetch('/api/add-supervisor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newSupName, email: newSupEmail, rollNo: newSupRollNo,
        password: newSupPassword,
        migrationCode: Math.random().toString(36).substring(2, 8).toUpperCase()
      })
    });
    if (res.ok) {
      showDialog({ title: "Success", message: `Supervisor ${newSupName} added!` });
      setNewSupName(''); setNewSupEmail(''); setNewSupRollNo(''); setNewSupPassword('');
      fetchSupervisors();
    } else showDialog({ title: "Error", message: "Failed to add supervisor" });
  };

  const handleDeleteSupervisor = (id: string, name: string) => {
    showDialog({
      type: 'confirm', title: 'Delete Supervisor?',
      message: `Are you sure you want to permanently delete ${name}? All their assigned students will be marked as "Unassigned".`,
      onConfirm: async () => {
        const res = await fetch('/api/delete-supervisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        if (res.ok) { fetchSupervisors(); fetchStudents(); }
        else showDialog({ title: "Error", message: "Failed to delete." });
      }
    });
  };

  const handleToggleNotifications = async (id: string, currentStatus: boolean) => {
    const res = await fetch('/api/supervisors/toggle-notifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled: !currentStatus })
    });
    if (res.ok) { fetchSupervisors(); }
    else { showDialog({ title: "Error", message: "Failed to toggle notifications." }); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col md:flex-row gap-6 min-h-[80vh] relative">
      {/* ---------- GRAPH MODAL (full version) ---------- */}
      <AnimatePresence>
        {isGraphModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 md:p-8">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsGraphModalOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`relative w-full h-full max-w-7xl flex flex-col rounded-[2rem] border shadow-2xl backdrop-blur-3xl overflow-hidden ${isDarkMode ? 'bg-[#18181b]/95 border-white/10 text-white' : 'bg-white/95 border-neutral-200/50 text-black'}`}
            >
              <div className="p-6 border-b flex justify-between items-center z-10 relative">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                  <Users className={theme.text} size={28} /> Total Students Mapping
                </h2>
                <button onClick={() => setIsGraphModalOpen(false)} className="p-2 rounded-full hover:bg-neutral-500/20 transition-colors">
                  <XCircle size={28} className="opacity-60" />
                </button>
              </div>

              <div className="flex-1 p-8 relative overflow-y-auto flex flex-col items-center justify-center">
                {isGraphLoading && graphData.students.length === 0 ? (
                  <Loader2 size={48} className={`animate-spin ${theme.text}`} />
                ) : (
                  <div className="flex-1 w-full overflow-y-auto custom-scrollbar">
                    <div className="relative w-full min-h-full px-4 md:px-20 max-w-5xl mx-auto flex flex-col gap-12 py-12">
                      <ConnectionLines students={graphData.students} isDarkMode={isDarkMode} theme={theme} />

                      {graphData.supervisors.map((sup: any) => {
                        const myStudents = graphData.students.filter((s: any) => s.supervisorId === sup._id);
                        return (
                          <div key={sup._id} className="flex justify-between items-center w-full z-10">
                            <div className="w-64 shrink-0">
                              <div id={`sup-${sup._id}`} className={`p-5 rounded-2xl border shadow-sm flex items-center justify-center text-center font-bold transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-200'}`}>
                                {sup.name}
                              </div>
                            </div>
                            <div className="flex flex-col gap-4 w-80 shrink-0">
                              {myStudents.length === 0 ? (
                                <div className="p-4 rounded-2xl border border-dashed opacity-40 text-center text-sm font-medium">No students assigned</div>
                              ) : (
                                myStudents.map((student: any) => (
                                  <div key={student._id} id={`stu-${student._id}`} className={`p-4 rounded-2xl border shadow-sm flex justify-between items-center transition-all ${student.isActive === false ? 'opacity-50 bg-red-500/5 border-red-500/20' : (isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-200')}`}>
                                    <div className="flex flex-col truncate pr-2">
                                      <span className={`font-bold truncate ${student.isActive === false ? 'line-through opacity-70' : ''}`}>{student.name}</span>
                                      {student.isActive === false && <span className="text-[10px] uppercase font-black tracking-wider text-red-500 mt-0.5">Deactivated</span>}
                                    </div>
                                    <button
                                      onClick={() => handleToggleStudentStatus(student._id, student.isActive !== false)}
                                      title={student.isActive !== false ? "Deactivate Student" : "Restore Student"}
                                      className={`p-2.5 rounded-xl transition-colors shrink-0 ${student.isActive !== false ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white'}`}
                                    >
                                      {student.isActive !== false ? <Trash2 size={18} /> : <CheckCircle size={18} />}
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {(() => {
                        const unassigned = graphData.students.filter((s: any) => !s.supervisorId);
                        if (unassigned.length === 0) return null;
                        return (
                          <div className="flex justify-between items-center w-full z-10 pt-8 border-t border-dashed border-neutral-500/30">
                            <div className="w-64 shrink-0">
                              <div className={`p-5 rounded-2xl border border-dashed opacity-50 flex items-center justify-center text-center font-bold ${isDarkMode ? 'border-neutral-500' : 'border-neutral-400'}`}>
                                Unassigned
                              </div>
                            </div>
                            <div className="flex flex-col gap-4 w-80 shrink-0">
                              {unassigned.map((student: any) => (
                                <div key={student._id} id={`stu-${student._id}`} className={`p-4 rounded-2xl border shadow-sm flex justify-between items-center transition-all ${student.isActive === false ? 'opacity-50 bg-red-500/5 border-red-500/20' : (isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-200')}`}>
                                  <div className="flex flex-col truncate pr-2">
                                    <span className={`font-bold truncate ${student.isActive === false ? 'line-through opacity-70' : ''}`}>{student.name}</span>
                                    {student.isActive === false && <span className="text-[10px] uppercase font-black tracking-wider text-red-500 mt-0.5">Deactivated</span>}
                                  </div>
                                  <button
                                    onClick={() => handleToggleStudentStatus(student._id, student.isActive !== false)}
                                    className={`p-2.5 rounded-xl transition-colors shrink-0 ${student.isActive !== false ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white'}`}
                                  >
                                    {student.isActive !== false ? <Trash2 size={18} /> : <CheckCircle size={18} />}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ---------- SIDEBAR ---------- */}
      <GlassCard isDarkMode={isDarkMode} className="w-full md:w-72 flex flex-col p-6 shrink-0 h-fit">
        <h3 className="text-xl font-extrabold mb-8 flex items-center gap-3 tracking-tight">
          <div className={`p-2 rounded-xl ${theme.lightBg} ${theme.text} transition-colors duration-500`}><LayoutDashboard size={20} /></div>
          Admin Panel
        </h3>
        <ul className="space-y-3 flex-1">
          <li onClick={() => setActiveTab('supervisors')} className={`flex items-center gap-3 font-semibold p-4 rounded-2xl cursor-pointer transition-all duration-300 ${activeTab === 'supervisors' ? `${theme.lightBg} ${theme.text}` : `opacity-70 hover:opacity-100 ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'}`}`}>
            <Users size={20} /> Supervisors
          </li>
          <li onClick={() => setActiveTab('students')} className={`flex items-center gap-3 font-semibold p-4 rounded-2xl cursor-pointer transition-all duration-300 ${activeTab === 'students' ? `${theme.lightBg} ${theme.text}` : `opacity-70 hover:opacity-100 ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'}`}`}>
            <User size={20} /> Total Students
          </li>
        </ul>

        {/* --- Headline Broadcaster --- */}
        <div className={`mt-8 pt-6 border-t ${isDarkMode ? 'border-neutral-800' : 'border-neutral-200'}`}>
          <h4 className="text-xs font-black uppercase tracking-widest opacity-50 mb-3 flex items-center gap-2"><Megaphone size={14}/> Broadcast</h4>
          <form onSubmit={handleBroadcastHeadline} className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Enter headline announcement..."
              value={headlineInput}
              onChange={(e) => setHeadlineInput(e.target.value)}
              className={`w-full text-sm px-3 py-2.5 rounded-xl border outline-none ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-300'}`}
            />
            <div className="flex gap-2">
              <button type="submit" className={`flex-1 py-2 text-xs font-bold rounded-xl text-white shadow-md ${theme.bg}`}>Send</button>
              <button type="button" onClick={clearHeadline} className="px-3 py-2 text-xs font-bold rounded-xl bg-red-500 text-white shadow-md" title="Clear Headline"><Trash2 size={14}/></button>
            </div>
          </form>
          {currentHeadline && <p className="text-[10px] mt-2 opacity-60 font-medium italic line-clamp-2">Current: "{currentHeadline}"</p>}
        </div>

        <div className={`mt-6 pt-6 border-t ${isDarkMode ? 'border-neutral-800' : 'border-neutral-200'}`}>
          <p className="text-sm font-bold opacity-60 mb-3 ml-1">{session?.user?.name}</p>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => signOut({ redirect: false })} className={`w-full bg-red-500/10 hover:bg-red-500 ${isDarkMode ? 'text-red-400' : 'text-red-600'} hover:text-white py-3 rounded-2xl transition-colors font-bold flex items-center justify-center gap-2`}><LogIn size={20} className="rotate-180" /> Logout</motion.button>
        </div>
      </GlassCard>

      {/* ---------- MAIN CONTENT (TABS) ---------- */}
      <div className="flex-1">
        {activeTab === 'supervisors' ? (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add Supervisor Card */}
            <GlassCard isDarkMode={isDarkMode} className="col-span-1 flex flex-col p-8 h-fit">
              <h4 className="text-lg font-extrabold tracking-tight mb-6 flex items-center gap-2"><PlusCircle size={20} className={theme.text} /> Add Supervisor</h4>
              <form onSubmit={handleAddSupervisor} className="space-y-5">
                <div><StyledInput isDarkMode={isDarkMode} theme={theme} value={newSupName} onChange={(e:any) => setNewSupName(e.target.value)} type="text" required placeholder="Full Name" /></div>
                <div><StyledInput isDarkMode={isDarkMode} theme={theme} value={newSupRollNo} onChange={(e:any) => setNewSupRollNo(e.target.value)} type="text" required placeholder="Username ID" /></div>
                <div><StyledInput isDarkMode={isDarkMode} theme={theme} value={newSupEmail} onChange={(e:any) => setNewSupEmail(e.target.value)} type="email" required placeholder="Supervisor Email" /></div>
                <div><StyledInput isDarkMode={isDarkMode} theme={theme} value={newSupPassword} onChange={(e:any) => setNewSupPassword(e.target.value)} type="text" required placeholder="Assign Password" /></div>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" className={`w-full ${theme.bg} text-white font-bold py-3.5 rounded-2xl transition-colors duration-500 mt-2 shadow-lg`}>Create Account</motion.button>
              </form>
            </GlassCard>

            {/* Active Supervisors List */}
            <GlassCard isDarkMode={isDarkMode} className="col-span-1 lg:col-span-2 p-8 flex flex-col h-[calc(100vh-10rem)] max-h-[800px]">
              <h4 className="text-lg font-extrabold tracking-tight mb-6">Active Supervisors <span className={`text-sm font-medium px-2 py-1 rounded-lg ml-2 ${theme.lightBg} ${theme.text}`}>{adminSupervisors.length}</span></h4>
              <div className="space-y-3 overflow-y-auto pr-2 flex-1 custom-scrollbar">
                <AnimatePresence>
                  {adminSupervisors.map(sup => (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} key={sup._id} className={`p-4 rounded-2xl flex justify-between items-center border transition-all duration-300 hover:scale-[1.01] ${isDarkMode ? 'border-neutral-800 bg-neutral-800/50' : 'border-neutral-100 bg-neutral-50/50'}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold shadow-md bg-gradient-to-br ${theme.gradient} transition-colors duration-500`}>{sup.name.charAt(0)}</div>
                        <div>
                          <p className="font-bold text-lg tracking-tight">{sup.name}</p>
                          <p onClick={() => handleUpdateEmail(sup._id, sup.email, sup.name)} className="text-sm font-medium opacity-60 cursor-pointer hover:underline hover:text-blue-500">
                            ID: {sup.rollNo} • {sup.email || 'Click to Assign Email'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-[10px] uppercase font-bold tracking-wider opacity-40 mb-1">Code</p>
                          <span className={`text-sm font-mono px-3 py-1.5 rounded-xl flex items-center gap-2 border transition-colors duration-500 ${theme.lightBg} ${theme.text} ${isDarkMode ? 'border-white/5' : 'border-black/5'}`}><Code size={14} /> {sup.migrationCode}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-4">
                          <button
                            onClick={() => handleToggleNotifications(sup._id, sup.notificationsEnabled !== false)}
                            title={sup.notificationsEnabled !== false ? "Disable Emails" : "Enable Emails"}
                            className={`p-2.5 rounded-xl transition-colors ${sup.notificationsEnabled !== false ? 'bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white' : 'bg-neutral-500/10 text-neutral-500 hover:bg-neutral-500 hover:text-white'}`}
                          >
                            {sup.notificationsEnabled !== false ? <Mail size={18} /> : <MailX size={18} />}
                          </button>
                          <button onClick={() => handleDeleteSupervisor(sup._id, sup.name)} className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors"><Trash2 size={18} /></button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </GlassCard>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="h-full">
            <GlassCard isDarkMode={isDarkMode} className="p-8 flex flex-col h-[calc(100vh-10rem)] max-h-[800px]">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                <h4 className="text-lg font-extrabold tracking-tight">Registered Students <span className={`text-sm font-medium px-2 py-1 rounded-lg ml-2 ${theme.lightBg} ${theme.text}`}>{filteredStudents.length}</span></h4>

                {/* Filter Pills */}
                <div className="flex flex-wrap gap-2 items-center">
                  <Filter size={16} className="opacity-40 mr-1 hidden md:block" />
                  {filterOptions.map(opt => (
                    <button key={opt} onClick={() => setStudentFilter(opt)} className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all duration-300 ${studentFilter === opt ? `${theme.bg} text-white shadow-md` : `opacity-60 hover:opacity-100 ${isDarkMode ? 'bg-neutral-800' : 'bg-neutral-200'}`}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 overflow-y-auto pr-2 flex-1 custom-scrollbar">
                {filteredStudents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full opacity-40">
                    <User size={48} className="mb-4" />
                    <p className="font-bold">No students match this filter.</p>
                  </div>
                ) : (
                  filteredStudents.map(student => (
                    <div key={student._id} className={`p-4 rounded-2xl flex justify-between items-center border transition-all duration-300 ${isDarkMode ? 'border-neutral-800 bg-neutral-800/50' : 'border-neutral-100 bg-neutral-50/50'}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white bg-gradient-to-br ${theme.gradient}`}>
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`font-bold ${student.isActive === false ? 'line-through opacity-70' : ''}`}>{student.name}</p>
                            {/* --- Clickable Program Tag with Hover Detail --- */}
                            <span 
                              onClick={() => handleUpdateProgram(student._id, student.program, student.name)}
                              title={`${PROGRAM_MAP[student.program] || 'Unknown Program'} (Click to Edit)`}
                              className={`cursor-pointer hover:scale-105 hover:shadow-md transition-all text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${theme.lightBg} ${theme.text}`}
                            >
                              {student.program || 'N/A'}
                            </span>
                          </div>
                          <p onClick={() => handleUpdateEmail(student._id, student.email, student.name)} className="text-sm font-medium opacity-60 cursor-pointer hover:underline hover:text-blue-500">
                            ID: {student.rollNo} • {student.email || 'Click to Assign Email'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-3 py-1.5 rounded-xl ${student.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400' : student.status === 'Rejected' ? 'bg-red-500/10 text-red-400' : student.status === 'Unassigned' ? 'bg-neutral-500/10 text-neutral-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {student.status || 'N/A'}
                        </span>
                        {student.isActive === false && <span className="text-[10px] uppercase font-black tracking-wider text-red-500 ml-2">Deactivated</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
          </motion.div>
        )}
      </div>

      {/* Floating Graph Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={openGraphModal}
        className={`fixed bottom-8 right-8 px-6 py-4 rounded-full font-extrabold shadow-2xl flex items-center gap-3 transition-colors ${theme.bg} text-white z-50`}
      >
        <Users size={20} /> View Visual Graph
      </motion.button>
    </motion.div>
  );
};

export default AdminDashboard;