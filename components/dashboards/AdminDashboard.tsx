'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut } from 'next-auth/react';
import { Users, XCircle, Trash2, CheckCircle, User, LayoutDashboard, LogIn, PlusCircle, Code, Mail, MailX, Loader2, Megaphone, Filter, Flame } from 'lucide-react';
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

          const startX = supRect.right - svgRect.left;
          const startY = supRect.top - svgRect.top + supRect.height / 2;

          const endX = stuRect.left - svgRect.left;
          const endY = stuRect.top - svgRect.top + stuRect.height / 2;

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
  const [supervisorSearch, setSupervisorSearch] = useState('');
  const [adminStudents, setAdminStudents] = useState<any[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const [studentPagination, setStudentPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [studentBatches, setStudentBatches] = useState<string[]>([]);
  const [isStudentsLoading, setIsStudentsLoading] = useState(false);

  const [headlineInput, setHeadlineInput] = useState('');
  const [currentHeadline, setCurrentHeadline] = useState('');
  const [studentFilter, setStudentFilter] = useState('All');
  const [batchFilter, setBatchFilter] = useState('All');
  const filterOptions = ['All', ...Object.keys(PROGRAM_MAP), 'Approved', 'Pending', 'Unassigned'];

  const uniqueBatches = studentBatches;

  const normalizedSupervisorSearch = supervisorSearch.trim().toLowerCase();

  const filteredSupervisors = normalizedSupervisorSearch
    ? adminSupervisors.filter((sup) => {
        const searchableFields = [
          sup.name,
          sup.rollNo,
          sup.email,
          sup.migrationCode,
        ];

        return searchableFields.some((field) =>
          String(field || '').toLowerCase().includes(normalizedSupervisorSearch)
        );
      })
    : adminSupervisors;

  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false);
  const [graphData, setGraphData] = useState({ supervisors: [], students: [] });
  const [isGraphLoading, setIsGraphLoading] = useState(false);

  const filteredStudents = adminStudents;
    const graphStudentGroups = useMemo(() => {
    const bySupervisor = new Map<string, any[]>();
    const unassigned: any[] = [];
    const students = Array.isArray(graphData.students) ? graphData.students : [];

    students.forEach((student: any) => {
      if (!student.supervisorId) {
        unassigned.push(student);
        return;
      }

      const supervisorId = String(student.supervisorId);
      const existingStudents = bySupervisor.get(supervisorId) || [];

      existingStudents.push(student);
      bySupervisor.set(supervisorId, existingStudents);
    });

    return {
      bySupervisor,
      unassigned,
      totalStudents: students.length,
      isLargeGraph: students.length > 500,
    };
  }, [graphData.students]);

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
  
  const fetchStudents = async (pageToFetch = studentPage) => {
    try {
      setIsStudentsLoading(true);

      const params = new URLSearchParams({
        page: String(pageToFetch),
        limit: String(studentPagination.limit || 20),
      });

      if (Object.keys(PROGRAM_MAP).includes(studentFilter)) {
        params.set('program', studentFilter);
      } else if (studentFilter !== 'All') {
        params.set('status', studentFilter);
      }

      if (batchFilter !== 'All') {
        params.set('batch', batchFilter);
      }

      if (debouncedStudentSearch) {
        params.set('search', debouncedStudentSearch);
      }

      const res = await fetch(`/api/admin/students?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch students');
      }

      setAdminStudents(Array.isArray(data.students) ? data.students : []);

      if (data.pagination) {
        setStudentPagination(data.pagination);
      }

      if (Array.isArray(data.filterMeta?.batches)) {
        setStudentBatches(data.filterMeta.batches);
      }
    } catch (err) {
      console.error('Student fetch error:', err);
    } finally {
      setIsStudentsLoading(false);
    }
  };

  const handleStudentFilterChange = (value: string) => {
    setStudentFilter(value);
    setStudentPage(1);
  };

  const handleBatchFilterChange = (value: string) => {
    setBatchFilter(value);
    setStudentPage(1);
  };

  const handleStudentPageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > studentPagination.totalPages || nextPage === studentPage) return;
    setStudentPage(nextPage);
  };

    useEffect(() => {
    fetchSupervisors();
    fetchHeadline();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStudentPage(1);
      setDebouncedStudentSearch(studentSearch.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [studentSearch]);

  useEffect(() => {
    fetchStudents(studentPage);
  }, [studentPage, studentFilter, batchFilter, debouncedStudentSearch]);

  const handleUpdateEmail = async (userId: string, currentEmail: string, name: string) => {
    showDialog({
      type: 'prompt',
      inputType: 'email',
      title: 'Update Email',
      message: `Enter a new email address for ${name}:`,
      defaultValue: currentEmail || '',
      onConfirm: async (newEmail: string) => {
        if (!newEmail || newEmail === currentEmail) return;
        const res = await fetch('/api/admin/update-email', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: userId, newEmail })
        });
        if (res.ok) { showDialog({ title: "Success", message: "Email updated!" }); fetchSupervisors(); fetchStudents(); }
        else { showDialog({ title: "Error", message: "Failed to update email." }); }
      }
    });
  };

  const handleUpdateProgram = async (userId: string, currentProgram: string, name: string) => {
  showDialog({
    type: 'prompt',
    inputType: 'select',
    inputOptions: Object.keys(PROGRAM_MAP),
    title: 'Update Program',
    message: `Select a new program for ${name}. This will reset this student and remove them from their current team.`,
    defaultValue: currentProgram || 'BSCS',
    onConfirm: async (newProgram: string) => {
      if (!newProgram || newProgram === currentProgram) return;

      showDialog({
        type: 'confirm',
        title: 'Warning: Student Reset',
        message: `Changing ${name}'s program to ${newProgram} will remove them from their current team, unassign their supervisor, reset their dashboard to Proposal, and create a fresh project. If they are the only member, uploaded project files will also be deleted. Proceed?`,
        onConfirm: async () => {
          const res = await fetch('/api/admin/update-program', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId: userId, newProgram }),
          });

          const data = await res.json();

          if (res.ok) {
            showDialog({
              title: "Success",
              message: data.message || "Program updated and student reset.",
            });
            fetchStudents();
          } else {
            showDialog({
              title: "Error",
              message: data.error || "Failed to update program.",
            });
          }
        },
      });
    },
  });
};

  const handleUpdateBatch = async (userId: string, currentBatch: string, name: string) => {
  const currentYear = new Date().getFullYear();
  const batchOptions: string[] = [];

  for (let year = 2021; year <= currentYear + 1; year++) {
    batchOptions.push(`Spring ${year}`);
    batchOptions.push(`Fall ${year}`);
  }

  showDialog({
    type: 'prompt',
    inputType: 'select',
    inputOptions: batchOptions,
    title: 'Update Batch',
    message: `Select a new batch for ${name}. This will reset this student and remove them from their current team.`,
    defaultValue: currentBatch || '',
    onConfirm: async (newBatch: string) => {
      if (!newBatch || newBatch === currentBatch) return;

      showDialog({
        type: 'confirm',
        title: 'Warning: Student Reset',
        message: `Changing ${name}'s batch to ${newBatch} will remove them from their current team, unassign their supervisor, reset their dashboard to Proposal, and create a fresh project. If they are the only member, uploaded project files will also be deleted. Proceed?`,
        onConfirm: async () => {
          const res = await fetch('/api/admin/update-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId: userId, newBatch }),
          });

          const data = await res.json();

          if (res.ok) {
            showDialog({
              title: "Success",
              message: data.message || "Batch updated and student reset.",
            });
            fetchStudents();
          } else {
            showDialog({
              title: "Error",
              message: data.error || "Failed to update batch.",
            });
          }
        },
      });
    },
  });
};

  const handlePromoteBatch = () => {
    if (batchFilter === 'All') {
       showDialog({ title: 'Action Required', message: 'Please select a specific batch from the filters above to promote.' });
       return;
    }
    showDialog({
      type: 'confirm', title: `Promote ${batchFilter}?`,
      message: `Are you sure you want to promote ALL students in ${batchFilter} to the 8th Semester?`,
      onConfirm: async () => {
        const res = await fetch('/api/admin/promote-batch', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetBatch: batchFilter })
        });
        const data = await res.json();
        if (res.ok) { showDialog({ title: "Success", message: data.message }); fetchStudents(); }
        else showDialog({ title: "Error", message: data.error });
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col md:flex-row gap-4 md:gap-6 min-h-[80vh] relative">
      {/* ---------- GRAPH MODAL ---------- */}
      <AnimatePresence>
        {isGraphModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 md:p-8">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 md:bg-black/60 md:backdrop-blur-md" onClick={() => setIsGraphModalOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`relative w-full h-full max-w-7xl flex flex-col rounded-[1.25rem] md:rounded-[2rem] border shadow-2xl md:backdrop-blur-3xl overflow-hidden ${isDarkMode ? 'bg-[#18181b] md:bg-[#18181b]/95 border-white/10 text-white' : 'bg-white md:bg-white/95 border-neutral-200/50 text-black'}`}
            >
              {/* Modal header — smaller on mobile */}
              <div className="p-3 md:p-6 border-b flex justify-between items-center z-10 relative">
                <h2 className="text-base md:text-2xl font-black tracking-tight flex items-center gap-2 md:gap-3">
                  <Users className={theme.text} size={20} /> Total Students Mapping
                </h2>
                <button onClick={() => setIsGraphModalOpen(false)} className="p-1.5 md:p-2 rounded-full hover:bg-neutral-500/20 transition-colors">
                  <XCircle size={22} className="opacity-60" />
                </button>
              </div>

              <div className="flex-1 p-3 md:p-8 relative overflow-y-auto flex flex-col items-center justify-center">
                {isGraphLoading && graphData.students.length === 0 ? (
                  <Loader2 size={48} className={`animate-spin ${theme.text}`} />
                ) : (
                  <div className="flex-1 w-full overflow-y-auto custom-scrollbar">
                    <div className="relative w-full min-h-full px-2 md:px-20 max-w-5xl mx-auto flex flex-col gap-6 md:gap-12 py-6 md:py-12">
                      <ConnectionLines students={graphData.students} isDarkMode={isDarkMode} theme={theme} />

                        {graphStudentGroups.isLargeGraph && (
                          <div className={`z-20 w-full rounded-xl md:rounded-2xl border px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm font-bold text-center ${isDarkMode ? 'border-amber-500/20 bg-amber-500/10 text-amber-400' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                            Large graph detected. Rendering {graphStudentGroups.totalStudents} students may take a few seconds.
                          </div>
                                )}

                      {graphData.supervisors.map((sup: any) => {
                        const myStudents = graphStudentGroups.bySupervisor.get(String(sup._id)) || [];
                        return (
                          <div key={sup._id} className="flex justify-between items-center w-full z-10">
                            <div className="w-36 md:w-64 shrink-0">
                              <div id={`sup-${sup._id}`} className={`p-3 md:p-5 rounded-xl md:rounded-2xl border shadow-sm flex flex-col items-center justify-center text-center font-bold text-xs md:text-base transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-200'}`}>
                                {sup.name}
                                {sup.monthlyLoginCount > 0 && <span className={`mt-1 text-[9px] md:text-[10px] font-black flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${isDarkMode ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-orange-50 text-orange-600 border-orange-200'}`} title="Logins this month"><Flame size={10} /> {sup.monthlyLoginCount}</span>}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 md:gap-4 w-40 md:w-80 shrink-0">
                              {myStudents.length === 0 ? (
                                <div className="p-2 md:p-4 rounded-xl md:rounded-2xl border border-dashed opacity-40 text-center text-xs font-medium">No students assigned</div>
                              ) : (
                                myStudents.map((student: any) => (
                                  <div key={student._id} id={`stu-${student._id}`} className={`p-2.5 md:p-4 rounded-xl md:rounded-2xl border shadow-sm flex justify-between items-center transition-all ${student.isActive === false ? 'opacity-50 bg-red-500/5 border-red-500/20' : (isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-200')}`}>
                                    <div className="flex flex-col truncate pr-1 md:pr-2">
                                      <span className={`font-bold text-xs md:text-base truncate flex items-center gap-2 ${student.isActive === false ? 'line-through opacity-70' : ''}`}>
                                        {student.name}
                                        {student.monthlyLoginCount > 0 && <span className={`text-[8px] font-black flex items-center gap-0.5 px-1 rounded border ${isDarkMode ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-orange-50 text-orange-600 border-orange-200'}`} title="Logins this month"><Flame size={8} /> {student.monthlyLoginCount}</span>}
                                      </span>
                                      {student.isActive === false && <span className="text-[9px] md:text-[10px] uppercase font-black tracking-wider text-red-500 mt-0.5">Deactivated</span>}
                                    </div>
                                    <button
                                      onClick={() => handleToggleStudentStatus(student._id, student.isActive !== false)}
                                      title={student.isActive !== false ? "Deactivate Student" : "Restore Student"}
                                      className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl transition-colors shrink-0 ${student.isActive !== false ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white'}`}
                                    >
                                      {student.isActive !== false ? <Trash2 size={14} /> : <CheckCircle size={14} />}
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {(() => {
                        const unassigned = graphStudentGroups.unassigned;
                        if (unassigned.length === 0) return null;
                        return (
                          <div className="flex justify-between items-center w-full z-10 pt-4 md:pt-8 border-t border-dashed border-neutral-500/30">
                            <div className="w-36 md:w-64 shrink-0">
                              <div className={`p-3 md:p-5 rounded-xl md:rounded-2xl border border-dashed opacity-50 flex items-center justify-center text-center font-bold text-xs md:text-base ${isDarkMode ? 'border-neutral-500' : 'border-neutral-400'}`}>
                                Unassigned
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 md:gap-4 w-40 md:w-80 shrink-0">
                              {unassigned.map((student: any) => (
                                <div key={student._id} id={`stu-${student._id}`} className={`p-2.5 md:p-4 rounded-xl md:rounded-2xl border shadow-sm flex justify-between items-center transition-all ${student.isActive === false ? 'opacity-50 bg-red-500/5 border-red-500/20' : (isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-200')}`}>
                                  <div className="flex flex-col truncate pr-1 md:pr-2">
                                    <span className={`font-bold text-xs md:text-base truncate flex items-center gap-2 ${student.isActive === false ? 'line-through opacity-70' : ''}`}>
                                      {student.name}
                                      {student.monthlyLoginCount > 0 && <span className={`text-[8px] font-black flex items-center gap-0.5 px-1 rounded border ${isDarkMode ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-orange-50 text-orange-600 border-orange-200'}`} title="Logins this month"><Flame size={8} /> {student.monthlyLoginCount}</span>}
                                    </span>
                                    {student.isActive === false && <span className="text-[9px] md:text-[10px] uppercase font-black tracking-wider text-red-500 mt-0.5">Deactivated</span>}
                                  </div>
                                  <button
                                    onClick={() => handleToggleStudentStatus(student._id, student.isActive !== false)}
                                    className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl transition-colors shrink-0 ${student.isActive !== false ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white'}`}
                                  >
                                    {student.isActive !== false ? <Trash2 size={14} /> : <CheckCircle size={14} />}
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
      <GlassCard isDarkMode={isDarkMode} className="w-full md:w-72 flex flex-col p-4 md:p-6 shrink-0 h-fit">
        <h3 className="text-base md:text-xl font-extrabold mb-5 md:mb-8 flex items-center gap-2 md:gap-3 tracking-tight">
          <div className={`p-1.5 md:p-2 rounded-lg md:rounded-xl ${theme.lightBg} ${theme.text} transition-colors duration-500`}><LayoutDashboard size={16} /></div>
          Admin Panel
        </h3>
        <ul className="space-y-2 md:space-y-3 flex-1">
          <li onClick={() => setActiveTab('supervisors')} className={`flex items-center gap-2 md:gap-3 font-semibold p-3 md:p-4 rounded-xl md:rounded-2xl cursor-pointer transition-all duration-300 text-sm md:text-base ${activeTab === 'supervisors' ? `${theme.lightBg} ${theme.text}` : `opacity-70 hover:opacity-100 ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'}`}`}>
            <Users size={16} /> Supervisors
          </li>
          <li onClick={() => setActiveTab('students')} className={`flex items-center gap-2 md:gap-3 font-semibold p-3 md:p-4 rounded-xl md:rounded-2xl cursor-pointer transition-all duration-300 text-sm md:text-base ${activeTab === 'students' ? `${theme.lightBg} ${theme.text}` : `opacity-70 hover:opacity-100 ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'}`}`}>
            <User size={16} /> Total Students
          </li>
        </ul>

        {/* --- Headline Broadcaster --- */}
        <div className={`mt-5 md:mt-8 pt-4 md:pt-6 border-t ${isDarkMode ? 'border-neutral-800' : 'border-neutral-200'}`}>
          <h4 className="text-[10px] md:text-xs font-black uppercase tracking-widest opacity-50 mb-2 md:mb-3 flex items-center gap-1.5 md:gap-2"><Megaphone size={12}/> Broadcast</h4>
          <form onSubmit={handleBroadcastHeadline} className="flex flex-col gap-1.5 md:gap-2">
            <input
              type="text"
              placeholder="Enter headline announcement..."
              value={headlineInput}
              onChange={(e) => setHeadlineInput(e.target.value)}
              className={`w-full text-xs md:text-sm px-2.5 md:px-3 py-2 md:py-2.5 rounded-lg md:rounded-xl border outline-none ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-300'}`}
            />
            <div className="flex gap-1.5 md:gap-2">
              <button type="submit" className={`flex-1 py-1.5 md:py-2 text-[11px] md:text-xs font-bold rounded-lg md:rounded-xl text-white shadow-md ${theme.bg}`}>Send</button>
              <button type="button" onClick={clearHeadline} className="px-2.5 md:px-3 py-1.5 md:py-2 text-[11px] md:text-xs font-bold rounded-lg md:rounded-xl bg-red-500 text-white shadow-md" title="Clear Headline"><Trash2 size={12}/></button>
            </div>
          </form>
          {currentHeadline && <p className="text-[9px] md:text-[10px] mt-1.5 md:mt-2 opacity-60 font-medium italic line-clamp-2">Current: "{currentHeadline}"</p>}
        </div>

        <div className={`mt-4 md:mt-6 pt-4 md:pt-6 border-t ${isDarkMode ? 'border-neutral-800' : 'border-neutral-200'}`}>
          <p className="text-xs md:text-sm font-bold opacity-60 mb-2 md:mb-3 ml-1">{session?.user?.name}</p>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => signOut({ redirect: false })} className={`w-full bg-red-500/10 hover:bg-red-500 ${isDarkMode ? 'text-red-400' : 'text-red-600'} hover:text-white py-2.5 md:py-3 rounded-xl md:rounded-2xl transition-colors font-bold flex items-center justify-center gap-2 text-sm md:text-base`}><LogIn size={16} className="rotate-180" /> Logout</motion.button>
        </div>
      </GlassCard>

      {/* ---------- MAIN CONTENT (TABS) ---------- */}
      <div className="flex-1">
        {activeTab === 'supervisors' ? (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            {/* Add Supervisor Card */}
            <GlassCard isDarkMode={isDarkMode} className="col-span-1 flex flex-col p-5 md:p-8 h-fit">
              <h4 className="text-sm md:text-lg font-extrabold tracking-tight mb-4 md:mb-6 flex items-center gap-2"><PlusCircle size={16} className={theme.text} /> Add Supervisor</h4>
              <form onSubmit={handleAddSupervisor} className="space-y-3 md:space-y-5">
                <div><StyledInput isDarkMode={isDarkMode} theme={theme} value={newSupName} onChange={(e:any) => setNewSupName(e.target.value)} type="text" required placeholder="Full Name" /></div>
                <div><StyledInput isDarkMode={isDarkMode} theme={theme} value={newSupRollNo} onChange={(e:any) => setNewSupRollNo(e.target.value)} type="text" required placeholder="Username ID" /></div>
                <div><StyledInput isDarkMode={isDarkMode} theme={theme} value={newSupEmail} onChange={(e:any) => setNewSupEmail(e.target.value)} type="email" required placeholder="Supervisor Email" /></div>
                <div><StyledInput isDarkMode={isDarkMode} theme={theme} value={newSupPassword} onChange={(e:any) => setNewSupPassword(e.target.value)} type="text" required placeholder="Assign Password" /></div>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" className={`w-full ${theme.bg} text-white font-bold py-2.5 md:py-3.5 rounded-xl md:rounded-2xl transition-colors duration-500 mt-1 md:mt-2 shadow-lg text-sm md:text-base`}>Create Account</motion.button>
              </form>
            </GlassCard>

            {/* Active Supervisors List */}
            <GlassCard isDarkMode={isDarkMode} className="col-span-1 lg:col-span-2 p-5 md:p-8 flex flex-col h-[calc(100vh-10rem)] max-h-[800px]">
              <div className="flex flex-col gap-3 md:gap-4 mb-4 md:mb-6">
                <h4 className="text-sm md:text-lg font-extrabold tracking-tight">
                  Active Supervisors
                  <span className={`text-xs md:text-sm font-medium px-1.5 md:px-2 py-0.5 md:py-1 rounded-md md:rounded-lg ml-1.5 md:ml-2 ${theme.lightBg} ${theme.text}`}>
                    {filteredSupervisors.length}{normalizedSupervisorSearch ? ` / ${adminSupervisors.length}` : ''}
                  </span>
                </h4>

                <StyledInput
                  isDarkMode={isDarkMode}
                  theme={theme}
                  value={supervisorSearch}
                  onChange={(e: any) => setSupervisorSearch(e.target.value)}
                  type="search"
                  placeholder="Search by name, ID, email, or code..."
                />
              </div>

              <div className="space-y-2 md:space-y-3 overflow-y-auto pr-1 md:pr-2 flex-1 custom-scrollbar">
                <AnimatePresence>
                  {filteredSupervisors.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      key="no-supervisors-found"
                      className="flex flex-col items-center justify-center h-full opacity-40 text-center"
                    >
                      <Users size={36} className="mb-3 md:mb-4" />
                      <p className="font-bold text-sm md:text-base">No supervisors match this search.</p>
                    </motion.div>
                  ) : (
                    filteredSupervisors.map(sup => (
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} key={sup._id} className={`p-3 md:p-4 rounded-xl md:rounded-2xl flex justify-between items-center border transition-all duration-300 hover:scale-[1.01] ${isDarkMode ? 'border-neutral-800 bg-neutral-800/50' : 'border-neutral-100 bg-neutral-50/50'}`}>
                        <div className="flex items-center gap-2.5 md:gap-4">
                          <div className={`w-9 h-9 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center text-white font-bold shadow-md bg-gradient-to-br ${theme.gradient} transition-colors duration-500 text-sm md:text-base`}>{sup.name.charAt(0)}</div>
                          <div>
                            <p className="font-bold text-sm md:text-lg tracking-tight flex items-center gap-2">
                              {sup.name}
                              {sup.monthlyLoginCount > 0 && <span className={`text-[9px] font-black flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${isDarkMode ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-orange-50 text-orange-600 border-orange-200'}`} title="Logins this month"><Flame size={10} /> {sup.monthlyLoginCount}</span>}
                            </p>
                            <p onClick={() => handleUpdateEmail(sup._id, sup.email, sup.name)} className="text-xs md:text-sm font-medium opacity-60 cursor-pointer hover:underline hover:text-blue-500">
                              ID: {sup.rollNo} • {sup.email || 'Click to Assign Email'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 md:gap-4 text-right">
                          <div className="hidden sm:block">
                            <p className="text-[9px] md:text-[10px] uppercase font-bold tracking-wider opacity-40 mb-1">Code</p>
                            <span className={`text-xs md:text-sm font-mono px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl flex items-center gap-1.5 md:gap-2 border transition-colors duration-500 ${theme.lightBg} ${theme.text} ${isDarkMode ? 'border-white/5' : 'border-black/5'}`}><Code size={12} /> {sup.migrationCode}</span>
                          </div>
                          <div className="flex items-center gap-1.5 md:gap-2 mt-0 md:mt-4">
                            <button
                              onClick={() => handleToggleNotifications(sup._id, sup.notificationsEnabled !== false)}
                              title={sup.notificationsEnabled !== false ? "Disable Emails" : "Enable Emails"}
                              className={`p-2 md:p-2.5 rounded-lg md:rounded-xl transition-colors ${sup.notificationsEnabled !== false ? 'bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white' : 'bg-neutral-500/10 text-neutral-500 hover:bg-neutral-500 hover:text-white'}`}
                            >
                              {sup.notificationsEnabled !== false ? <Mail size={15} /> : <MailX size={15} />}
                            </button>
                            <button onClick={() => handleDeleteSupervisor(sup._id, sup.name)} className="p-2 md:p-2.5 rounded-lg md:rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors"><Trash2 size={15} /></button>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </GlassCard>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="h-full">
            <GlassCard isDarkMode={isDarkMode} className="p-4 md:p-8 flex flex-col h-[calc(100vh-10rem)] max-h-[800px]">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 md:mb-6 gap-3 md:gap-4">
                <div className="flex flex-col gap-2 w-full md:max-w-xs">
                  <h4 className="text-sm md:text-lg font-extrabold tracking-tight">
                    Registered Students
                    <span className={`text-xs md:text-sm font-medium px-1.5 md:px-2 py-0.5 md:py-1 rounded-md md:rounded-lg ml-1.5 md:ml-2 ${theme.lightBg} ${theme.text}`}>
                      {studentPagination.total}
                    </span>
                  </h4>

                  <StyledInput
                    isDarkMode={isDarkMode}
                    theme={theme}
                    value={studentSearch}
                    onChange={(e: any) => setStudentSearch(e.target.value)}
                    type="search"
                    placeholder="Search students by name, ID, or email..."
                  />
                </div>

                {/* Filter Pills */}
                <div className="flex flex-col gap-2 md:gap-3 items-start md:items-end">
                  <div className="flex flex-wrap gap-1.5 md:gap-2 items-center">
                    <Filter size={13} className="opacity-40 mr-0.5 hidden md:block" />
                    {filterOptions.map(opt => (
                      <button key={opt} onClick={() => handleStudentFilterChange(opt)} className={`px-2.5 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-bold rounded-lg md:rounded-xl transition-all duration-300 ${studentFilter === opt ? `${theme.bg} text-white shadow-md` : `opacity-60 hover:opacity-100 ${isDarkMode ? 'bg-neutral-800' : 'bg-neutral-200'}`}`}>
                        {opt}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5 md:gap-2 items-center">
                    <span className="text-[9px] md:text-xs font-bold opacity-40 uppercase tracking-widest mr-0.5">Batch:</span>

                    <button
                      onClick={() => handleBatchFilterChange('All')}
                      className={`px-2.5 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-bold rounded-lg md:rounded-xl transition-all duration-300 ${batchFilter === 'All' ? `${theme.bg} text-white shadow-md` : `opacity-60 hover:opacity-100 ${isDarkMode ? 'bg-neutral-800' : 'bg-neutral-200'}`}`}
                    >
                      All
                    </button>

                    {uniqueBatches.map((b: any) => (
                      <button
                        key={b}
                        onClick={() => handleBatchFilterChange(b)}
                        className={`px-2.5 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-bold rounded-lg md:rounded-xl transition-all duration-300 ${batchFilter === b ? `${theme.bg} text-white shadow-md` : `opacity-60 hover:opacity-100 ${isDarkMode ? 'bg-neutral-800' : 'bg-neutral-200'}`}`}
                      >
                        {b}
                      </button>
                    ))}

                    {batchFilter !== 'All' && (
                      <button onClick={handlePromoteBatch} className={`ml-1 md:ml-2 px-2.5 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-bold rounded-lg md:rounded-xl transition-all shadow-md bg-purple-500 hover:bg-purple-600 text-white flex items-center gap-1`}>
                        Promote to 8th Sem
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2 md:space-y-3 overflow-y-auto pr-1 md:pr-2 flex-1 custom-scrollbar">
                {isStudentsLoading ? (
                  <div className="flex flex-col items-center justify-center h-full opacity-60">
                    <Loader2 size={36} className={`animate-spin mb-3 md:mb-4 ${theme.text}`} />
                    <p className="font-bold text-sm md:text-base">Loading students...</p>
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full opacity-40">
                    <User size={36} className="mb-3 md:mb-4" />
                    <p className="font-bold text-sm md:text-base">No students match this filter.</p>
                  </div>
                ) : (
                  filteredStudents.map(student => (
                    <div key={student._id} className={`p-3 md:p-4 rounded-xl md:rounded-2xl flex justify-between items-center border transition-all duration-300 ${isDarkMode ? 'border-neutral-800 bg-neutral-800/50' : 'border-neutral-100 bg-neutral-50/50'}`}>
                      <div className="flex items-center gap-2.5 md:gap-4">
                        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center font-bold text-white bg-gradient-to-br ${theme.gradient} text-sm md:text-base`}>
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                            <p className={`font-bold text-sm md:text-base flex items-center gap-2 ${student.isActive === false ? 'line-through opacity-70' : ''}`}>
                              {student.name}
                              {student.monthlyLoginCount > 0 && <span className={`text-[9px] font-black flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${isDarkMode ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-orange-50 text-orange-600 border-orange-200'}`} title="Logins this month"><Flame size={10} /> {student.monthlyLoginCount}</span>}
                            </p>
                            <span 
                              onClick={() => handleUpdateProgram(student._id, student.program, student.name)}
                              title={`${PROGRAM_MAP[student.program] || 'Unknown Program'} (Click to Edit)`}
                              className={`cursor-pointer hover:scale-105 hover:shadow-md transition-all text-[9px] md:text-[10px] font-black uppercase tracking-wider px-1.5 md:px-2 py-0.5 rounded-md ${theme.lightBg} ${theme.text}`}
                            >
                              {student.program || 'N/A'}
                            </span>
                            <span 
                              onClick={() => handleUpdateBatch(student._id, student.batch, student.name)}
                              title="Click to Edit Batch"
                              className={`cursor-pointer hover:scale-105 hover:shadow-md transition-all text-[9px] md:text-[10px] font-black uppercase tracking-wider px-1.5 md:px-2 py-0.5 rounded-md border ${isDarkMode ? 'border-neutral-700 text-neutral-300' : 'border-neutral-300 text-neutral-600'}`}
                            >
                              {student.batch || 'No Batch'} • {student.semester || '7th Sem'}
                            </span>
                          </div>
                          <p onClick={() => handleUpdateEmail(student._id, student.email, student.name)} className="text-[11px] md:text-sm font-medium opacity-60 cursor-pointer hover:underline hover:text-blue-500">
                            ID: {student.rollNo} • {student.email || 'Click to Assign Email'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-3">
                        <span className={`text-[10px] md:text-xs font-bold px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl ${student.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400' : student.status === 'Rejected' ? 'bg-red-500/10 text-red-400' : student.status === 'Unassigned' ? 'bg-neutral-500/10 text-neutral-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {student.status || 'N/A'}
                        </span>
                        {student.isActive === false && <span className="text-[9px] md:text-[10px] uppercase font-black tracking-wider text-red-500">Deactivated</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className={`mt-4 pt-3 border-t flex flex-col md:flex-row gap-3 md:items-center md:justify-between text-xs md:text-sm ${isDarkMode ? 'border-neutral-800' : 'border-neutral-200'}`}>
                <p className="font-bold opacity-60">
                  Showing {filteredStudents.length} of {studentPagination.total} students
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isStudentsLoading || studentPage <= 1}
                    onClick={() => handleStudentPageChange(studentPage - 1)}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${isDarkMode ? 'bg-neutral-800 hover:bg-neutral-700' : 'bg-neutral-200 hover:bg-neutral-300'}`}
                  >
                    Previous
                  </button>

                  <span className="font-bold opacity-70">
                    Page {studentPagination.total === 0 ? 0 : studentPage} of {studentPagination.totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={isStudentsLoading || studentPage >= studentPagination.totalPages}
                    onClick={() => handleStudentPageChange(studentPage + 1)}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${isDarkMode ? 'bg-neutral-800 hover:bg-neutral-700' : 'bg-neutral-200 hover:bg-neutral-300'}`}
                  >
                    Next
                  </button>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </div>

      {/* Floating Graph Button — smaller on mobile */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={openGraphModal}
        className={`fixed bottom-5 md:bottom-8 right-4 md:right-8 px-4 md:px-6 py-3 md:py-4 rounded-full font-extrabold shadow-2xl flex items-center gap-2 md:gap-3 transition-colors ${theme.bg} text-white z-50 text-xs md:text-base`}
      >
        <Users size={16} /> View Visual Graph
      </motion.button>
    </motion.div>
  );
};

export default AdminDashboard;