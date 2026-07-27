'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { signOut } from 'next-auth/react';
import {
  BarChart3,
  CircleDollarSign,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
  LogIn,
  Users,
} from 'lucide-react';

import {
  Button,
  DashboardShell,
} from '../ui/SharedUI';

import { PROGRAM_MAP } from '../../config/appSettings';
import { MAX_EXTRA_SUPERVISOR_SLOTS } from '../../lib/supervisorSlots';
import RegistrationControlPanel from '../admin/RegistrationControlPanel';
import FineManagementPanel from '../admin/FineManagementPanel';
import AdminOverviewSection from '../admin/AdminOverviewSection';
import AdminHeadlineSection from '../admin/AdminHeadlineSection';
import AdminStudentsSection from '../admin/AdminStudentsSection';
import AdminSupervisorsSection, {
  SupervisorSlotEditorDialog,
} from '../admin/AdminSupervisorsSection';
import {
  AdminReportsDialog,
  REPORT_OPTIONS,
  buildCsv,
  buildReportHtml,
  downloadTextFile,
  toReportRows,
  type ReportOption,
} from '../admin/AdminReports';
import type {
  AdminDashboardProps,
  AdminReportsData,
  AdminStudent,
  AdminSupervisor,
} from '../admin/adminDashboardTypes';

const loadAdminProjectReviewsPanel = () => import('../admin/AdminProjectReviewsPanel');
const AdminProjectReviewsPanel = dynamic(loadAdminProjectReviewsPanel, {
  loading: () => <div className="flex min-h-[24rem] items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">Loading project reviews...</div>,
});

type AdminTab = 'overview' | 'supervisors' | 'students' | 'reviews' | 'registration' | 'fines';

const AdminDashboard = ({
  session,
  showDialog,
  registrationPolicy,
  onRegistrationPolicyChange,
}: AdminDashboardProps) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  const [newSupName, setNewSupName] = useState('');
  const [newSupEmail, setNewSupEmail] = useState('');
  const [newSupRollNo, setNewSupRollNo] = useState('');
  const [newSupPassword, setNewSupPassword] = useState('');

  const [adminSupervisors, setAdminSupervisors] = useState<AdminSupervisor[]>([]);
  const [supervisorSearch, setSupervisorSearch] = useState('');

  const [adminStudents, setAdminStudents] = useState<AdminStudent[]>([]);
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

  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);
  const [reportsData, setReportsData] = useState<AdminReportsData | null>(null);
  const [isReportsLoading, setIsReportsLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<ReportOption['id']>('studentsPerSupervisor');


  const [slotEditorSupervisor, setSlotEditorSupervisor] = useState<AdminSupervisor | null>(null);
  const [slotEditorValue, setSlotEditorValue] = useState('0');
  const [isSlotEditorSaving, setIsSlotEditorSaving] = useState(false);

  const filterOptions = ['All', ...Object.keys(PROGRAM_MAP), 'Approved', 'Pending', 'Unassigned'];

  const filteredStudents = adminStudents;

  const filteredSupervisors = useMemo(() => {
    const query = supervisorSearch.trim().toLowerCase();

    if (!query) return adminSupervisors;

    return adminSupervisors.filter((supervisor) => {
      const fields = [
        supervisor.name,
        supervisor.rollNo,
        supervisor.email,
        supervisor.migrationCode,
      ];

      return fields.some((field) => String(field || '').toLowerCase().includes(query));
    });
  }, [adminSupervisors, supervisorSearch]);


  const stats = useMemo(() => {
    const loadedStudents = Array.isArray(adminStudents) ? adminStudents : [];
    const activeStudents = loadedStudents.filter((student) => student.isActive !== false).length;
    const pendingStudents = loadedStudents.filter(
      (student) => student.status && student.status !== 'Approved'
    ).length;

    return {
      totalStudents: studentPagination.total || loadedStudents.length,
      loadedStudents: loadedStudents.length,
      activeStudents,
      pendingStudents,
      supervisors: adminSupervisors.length,
    };
  }, [adminStudents, adminSupervisors.length, studentPagination.total]);


  const selectedReport = useMemo(() => {
    return REPORT_OPTIONS.find((report) => report.id === selectedReportId) || REPORT_OPTIONS[0];
  }, [selectedReportId]);

  const selectedReportRows = useMemo(() => {
    return toReportRows(reportsData, selectedReportId);
  }, [reportsData, selectedReportId]);

  const fetchHeadline = useCallback(async () => {
    try {
      const response = await fetch('/api/headline');
      const data = await response.json();

      setCurrentHeadline(data.headline?.text || '');
    } catch (error) {
      console.error('Headline fetch error:', error);
    }
  }, []);

  const fetchSupervisors = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/supervisors', { cache: 'no-store' });
      const data = await response.json();

      setAdminSupervisors(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Supervisor fetch error:', error);
    }
  }, []);

  const fetchStudents = useCallback(async (pageToFetch = studentPage) => {
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

      const response = await fetch(`/api/admin/students?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch students');
      }

      setAdminStudents(Array.isArray(data.students) ? data.students : []);

      if (data.pagination) {
        setStudentPagination(data.pagination);
      }

      if (Array.isArray(data.filterMeta?.batches)) {
        setStudentBatches(data.filterMeta.batches);
      }
    } catch (error) {
      console.error('Student fetch error:', error);
      showDialog({
        title: 'Students could not load',
        message: 'The student list could not be loaded. Please refresh or try again later.',
      });
    } finally {
      setIsStudentsLoading(false);
    }
  }, [batchFilter, debouncedStudentSearch, showDialog, studentFilter, studentPage, studentPagination.limit]);


  const fetchReportsData = async () => {
    setIsReportsLoading(true);

    try {
      const response = await fetch('/api/admin/reports', { cache: 'no-store' });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load reports');
      }

      setReportsData(data);
    } catch (error) {
      console.error('Reports error:', error);
      showDialog({
        title: 'Reports unavailable',
        message: 'Unable to load report data right now. Please refresh and try again.',
      });
    } finally {
      setIsReportsLoading(false);
    }
  };

  const openReportsModal = async () => {
    setIsReportsModalOpen(true);
    await fetchReportsData();
  };

  const handleOpenReportInNewTab = () => {
    if (!reportsData) return;

    const html = buildReportHtml(reportsData, selectedReport, selectedReportRows);
    const reportWindow = window.open('', '_blank');

    if (!reportWindow) {
      showDialog({
        title: 'Popup blocked',
        message: 'Allow popups for this portal, then click Open Report again. The report is not downloaded or saved.',
      });
      return;
    }

    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
  };

  const handleDownloadHtmlReport = () => {
    if (!reportsData) return;

    const html = buildReportHtml(reportsData, selectedReport, selectedReportRows);
    downloadTextFile(html, `${selectedReport.id}-report.html`, 'text/html');
  };

  const handleDownloadCsvReport = () => {
    const csv = buildCsv(selectedReportRows);
    downloadTextFile(csv, `${selectedReport.id}-report.csv`, 'text/csv');
  };

  useEffect(() => {
    void Promise.resolve().then(() => {
      void fetchSupervisors();
      void fetchHeadline();
    });
  }, [fetchHeadline, fetchSupervisors]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAdminProjectReviewsPanel();
      void fetch('/api/admin/project-reviews?page=1&limit=24', {
        credentials: 'same-origin',
      }).catch(() => undefined);
    }, 750);

    return () => window.clearTimeout(timer);
  }, []);


  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStudentPage(1);
      setDebouncedStudentSearch(studentSearch.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [studentSearch]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchStudents(studentPage));
  }, [fetchStudents, studentPage]);

  const handleBroadcastHeadline = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const text = headlineInput.trim();

    if (!text) {
      showDialog({
        title: 'Announcement required',
        message: 'Write an announcement before broadcasting it to students.',
      });
      return;
    }

    try {
      const response = await fetch('/api/headline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (response.ok) {
        showDialog({
          title: 'Announcement published',
          message: data.message || 'The headline announcement has been published.',
        });
        setHeadlineInput('');
        fetchHeadline();
      } else {
        showDialog({
          title: 'Announcement failed',
          message: data.error || 'Failed to update the headline announcement.',
        });
      }
    } catch {
      showDialog({
        title: 'Connection error',
        message: 'Unable to publish the announcement right now.',
      });
    }
  };

  const clearHeadline = async () => {
    try {
      const response = await fetch('/api/headline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '' }),
      });

      const data = await response.json();

      if (response.ok) {
        showDialog({
          title: 'Announcement cleared',
          message: data.message || 'The headline announcement has been removed.',
        });
        fetchHeadline();
      } else {
        showDialog({
          title: 'Clear failed',
          message: data.error || 'Failed to clear the headline announcement.',
        });
      }
    } catch {
      showDialog({
        title: 'Connection error',
        message: 'Unable to clear the announcement right now.',
      });
    }
  };

  const handleAddSupervisor = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = newSupName.trim();
    const email = newSupEmail.trim();
    const rollNo = newSupRollNo.trim();

    if (!name || !email || !rollNo || !newSupPassword) {
      showDialog({
        title: 'Missing supervisor details',
        message: 'Enter name, email, username ID, and password before creating the account.',
      });
      return;
    }

    try {
      const response = await fetch('/api/add-supervisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          rollNo,
          password: newSupPassword,
          migrationCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        showDialog({
          title: 'Supervisor created',
          message: data.message || `Supervisor ${name} has been added successfully.`,
        });
        setNewSupName('');
        setNewSupEmail('');
        setNewSupRollNo('');
        setNewSupPassword('');
        fetchSupervisors();
      } else {
        showDialog({
          title: 'Supervisor creation failed',
          message: data.error || 'Failed to add the supervisor.',
        });
      }
    } catch {
      showDialog({
        title: 'Connection error',
        message: 'Unable to create supervisor right now.',
      });
    }
  };

  const handleDeleteSupervisor = (id: string, name: string) => {
    showDialog({
      type: 'confirm',
      title: 'Delete supervisor?',
      message: `This will permanently delete ${name}. Their assigned students will be marked as unassigned.`,
      onConfirm: async () => {
        try {
          const response = await fetch('/api/delete-supervisor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          });

          if (response.ok) {
            fetchSupervisors();
            fetchStudents();
          } else {
            showDialog({
              title: 'Delete failed',
              message: 'Failed to delete the supervisor.',
            });
          }
        } catch {
          showDialog({
            title: 'Connection error',
            message: 'Unable to delete supervisor right now.',
          });
        }
      },
    });
  };

  const handleToggleNotifications = async (id: string, currentStatus: boolean) => {
    try {
      const response = await fetch('/api/supervisors/toggle-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled: !currentStatus }),
      });

      if (response.ok) {
        fetchSupervisors();
      } else {
        showDialog({
          title: 'Update failed',
          message: 'Failed to update supervisor notification settings.',
        });
      }
    } catch {
      showDialog({
        title: 'Connection error',
        message: 'Unable to update notification settings right now.',
      });
    }
  };

  const openSupervisorSlotEditor = (supervisor: AdminSupervisor) => {
    const currentExtraSlots = Math.min(
      Math.max(Number(supervisor.extraSlots || 0), 0),
      MAX_EXTRA_SUPERVISOR_SLOTS
    );

    setSlotEditorSupervisor(supervisor);
    setSlotEditorValue(String(currentExtraSlots));
  };

  const closeSupervisorSlotEditor = () => {
    if (isSlotEditorSaving) return;

    setSlotEditorSupervisor(null);
    setSlotEditorValue('0');
  };

  const handleSaveSupervisorExtraSlots = async () => {
    if (!slotEditorSupervisor) return;

    const requestedExtraSlots = Number(slotEditorValue);

    if (
      !Number.isInteger(requestedExtraSlots) ||
      requestedExtraSlots < 0 ||
      requestedExtraSlots > MAX_EXTRA_SUPERVISOR_SLOTS
    ) {
      showDialog({
        title: 'Invalid extra slots',
        message: `Enter a whole number from 0 to ${MAX_EXTRA_SUPERVISOR_SLOTS}.`,
      });
      return;
    }

    setIsSlotEditorSaving(true);

    try {
      const response = await fetch('/api/admin/update-supervisor-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supervisorId: slotEditorSupervisor._id,
          extraSlots: requestedExtraSlots,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setSlotEditorSupervisor(null);
        setSlotEditorValue('0');
        showDialog({
          title: 'Extra slots updated',
          message: data.message || 'Supervisor slot allowance has been updated.',
        });
        fetchSupervisors();
      } else {
        showDialog({
          title: 'Update failed',
          message: data.error || 'Failed to update supervisor extra slots.',
        });
      }
    } catch {
      showDialog({
        title: 'Connection error',
        message: 'Unable to update supervisor slots right now.',
      });
    } finally {
      setIsSlotEditorSaving(false);
    }
  };

  const handleUpdateEmail = async (userId: string, currentEmail: string, name: string) => {
    showDialog({
      type: 'prompt',
      inputType: 'email',
      title: 'Update email',
      message: `Enter a new email address for ${name}.`,
      defaultValue: currentEmail || '',
      onConfirm: async (newEmail = '') => {
        const cleanedEmail = String(newEmail || '').trim().toLowerCase();
        const cleanedCurrentEmail = String(currentEmail || '').trim().toLowerCase();

        if (!cleanedEmail || cleanedEmail === cleanedCurrentEmail) return;

        try {
          const response = await fetch('/api/admin/update-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId: userId, newEmail: cleanedEmail }),
          });

          const data = await response.json().catch(() => ({}));

          if (response.ok) {
            const updatedEmail = data.user?.email || data.email || cleanedEmail;

            // Update the visible card immediately so the admin does not see stale data
            // while the fresh list is being reloaded from the server.
            setAdminStudents((students) =>
              students.map((student) =>
                student._id === userId ? { ...student, email: updatedEmail } : student
              )
            );

            setAdminSupervisors((supervisors) =>
              supervisors.map((supervisor) =>
                supervisor._id === userId ? { ...supervisor, email: updatedEmail } : supervisor
              )
            );

            showDialog({
              title: 'Email updated',
              message: data.message || 'The email address has been updated.',
            });

            await Promise.all([fetchSupervisors(), fetchStudents(studentPage)]);
          } else {
            showDialog({
              title: 'Update failed',
              message: data.error || 'Failed to update email.',
            });
          }
        } catch {
          showDialog({
            title: 'Connection error',
            message: 'Unable to update email right now.',
          });
        }
      },
    });
  };

  const handleUpdateProgram = async (userId: string, currentProgram: string, name: string) => {
    showDialog({
      type: 'prompt',
      inputType: 'select',
      inputOptions: Object.keys(PROGRAM_MAP),
      title: 'Update program',
      message: `Select a new program for ${name}. This will reset this student and remove them from their current team.`,
      defaultValue: currentProgram || 'BSCS',
      onConfirm: async (newProgram = '') => {
        if (!newProgram || newProgram === currentProgram) return;

        showDialog({
          type: 'confirm',
          title: 'Confirm student reset',
          message: `Changing ${name}'s program to ${newProgram} will remove them from their current team, unassign their supervisor, reset their dashboard to Proposal, and create a fresh project. Proceed?`,
          onConfirm: async () => {
            const response = await fetch('/api/admin/update-program', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ targetUserId: userId, newProgram }),
            });

            const data = await response.json();

            if (response.ok) {
              showDialog({
                title: 'Program updated',
                message: data.message || 'Program updated and student reset.',
              });
              fetchStudents();
            } else {
              showDialog({
                title: 'Update failed',
                message: data.error || 'Failed to update program.',
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
      title: 'Update batch',
      message: `Select a new batch for ${name}. This will reset this student and remove them from their current team.`,
      defaultValue: currentBatch || '',
      onConfirm: async (newBatch = '') => {
        if (!newBatch || newBatch === currentBatch) return;

        showDialog({
          type: 'confirm',
          title: 'Confirm student reset',
          message: `Changing ${name}'s batch to ${newBatch} will remove them from their current team, unassign their supervisor, reset their dashboard to Proposal, and create a fresh project. Proceed?`,
          onConfirm: async () => {
            const response = await fetch('/api/admin/update-batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ targetUserId: userId, newBatch }),
            });

            const data = await response.json();

            if (response.ok) {
              showDialog({
                title: 'Batch updated',
                message: data.message || 'Batch updated and student reset.',
              });
              fetchStudents();
            } else {
              showDialog({
                title: 'Update failed',
                message: data.error || 'Failed to update batch.',
              });
            }
          },
        });
      },
    });
  };

  const handlePromoteBatch = () => {
    if (batchFilter === 'All') {
      showDialog({
        title: 'Select a batch',
        message: 'Choose a specific batch before promoting students to 8th Semester.',
      });
      return;
    }

    showDialog({
      type: 'confirm',
      title: `Promote ${batchFilter}?`,
      message: `This will promote all students in ${batchFilter} to 8th Semester.`,
      onConfirm: async () => {
        const response = await fetch('/api/admin/promote-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetBatch: batchFilter }),
        });

        const data = await response.json();

        if (response.ok) {
          showDialog({
            title: 'Batch promoted',
            message: data.message || 'Batch promoted successfully.',
          });
          fetchStudents();
        } else {
          showDialog({
            title: 'Promotion failed',
            message: data.error || 'Failed to promote batch.',
          });
        }
      },
    });
  };

  const handleToggleStudentStatus = async (studentId: string, currentStatus: boolean) => {
    try {
      const response = await fetch('/api/admin/toggle-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, isActive: !currentStatus }),
      });

      if (response.ok) {
        fetchStudents();

        if (isReportsModalOpen) {
              }
      } else {
        showDialog({
          title: 'Status update failed',
          message: 'Failed to update student account status.',
        });
      }
    } catch {
      showDialog({
        title: 'Connection error',
        message: 'Unable to update student status right now.',
      });
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

  const navItems = [
    {
      id: 'overview',
      label: 'Overview',
      icon: <LayoutDashboard size={18} />,
      active: activeTab === 'overview',
      onClick: () => setActiveTab('overview'),
    },
    {
      id: 'supervisors',
      label: 'Supervisors',
      icon: <Users size={18} />,
      active: activeTab === 'supervisors',
      badge: adminSupervisors.length,
      onClick: () => setActiveTab('supervisors'),
    },
    {
      id: 'students',
      label: 'Students',
      icon: <GraduationCap size={18} />,
      active: activeTab === 'students',
      badge: studentPagination.total || adminStudents.length,
      onClick: () => setActiveTab('students'),
    },
    {
      id: 'reviews',
      label: 'Project Reviews',
      icon: <ClipboardCheck size={18} />,
      active: activeTab === 'reviews',
      onClick: () => setActiveTab('reviews'),
    },
    {
      id: 'registration',
      label: 'Registration',
      icon: <LockKeyhole size={18} />,
      active: activeTab === 'registration',
      badge: registrationPolicy?.isOpen === false ? 'Closed' : 'Open',
      className:
        registrationPolicy?.isOpen === false
          ? 'border border-red-500/40 !bg-red-300/50 !text-red-950 hover:!bg-red-300/50 dark:!text-red-50'
          : 'border border-emerald-500/40 !bg-emerald-300/50 !text-emerald-950 hover:!bg-emerald-300/50 dark:!text-emerald-50',
      iconClassName:
        registrationPolicy?.isOpen === false
          ? '!text-red-900 dark:!text-red-100'
          : '!text-emerald-900 dark:!text-emerald-100',
      badgeClassName:
        registrationPolicy?.isOpen === false
          ? '!bg-red-950/10 !text-red-950 dark:!bg-red-50/10 dark:!text-red-50'
          : '!bg-emerald-950/10 !text-emerald-950 dark:!bg-emerald-50/10 dark:!text-emerald-50',
      onClick: () => setActiveTab('registration'),
    },
    {
      id: 'fines',
      label: 'Fines',
      icon: <CircleDollarSign size={18} />,
      active: activeTab === 'fines',
      onClick: () => setActiveTab('fines'),
    },
    { id: 'reports', label: 'Reports',
      icon: <BarChart3 size={18} />,
      onClick: openReportsModal,
    },
  ];

  return (
    <>
      <DashboardShell
        title="Admin Dashboard"
        description="Manage the complete FYP portal ecosystem."
        navItems={navItems}
        className={`lg:h-[calc(100vh-7.5rem)] lg:min-h-0 [&>div]:lg:h-full [&>div]:lg:min-h-0 ${
          activeTab === 'supervisors' || activeTab === 'students'
            ? '[&>div>div>main]:lg:overflow-hidden'
            : ''
        }`}
        user={{
          name: session?.user?.name || 'Administrator',
          role: 'Admin',
        }}
        actions={
          <div className="grid gap-2 sm:flex">
            <Button variant="outline" onClick={openReportsModal}>
              <BarChart3 size={16} />
              Reports
            </Button>

            <Button variant="danger" onClick={() => signOut({ redirect: false })}>
              <LogIn size={16} className="rotate-180" />
              Logout
            </Button>
          </div>
        }
      >
        {activeTab === 'overview' && (
          <div className="space-y-7 sm:space-y-6">
            <AdminOverviewSection
              stats={stats}
              onOpenSupervisors={() => setActiveTab('supervisors')}
              onOpenStudents={() => setActiveTab('students')}
              onOpenReports={openReportsModal}
            />
            <AdminHeadlineSection
              headlineInput={headlineInput}
              onHeadlineInputChange={setHeadlineInput}
              currentHeadline={currentHeadline}
              onBroadcast={handleBroadcastHeadline}
              onClear={clearHeadline}
            />
          </div>
        )}
        {activeTab === 'supervisors' && (
          <div className="min-h-0 lg:h-full">
            <AdminSupervisorsSection
              newSupervisor={{ name: newSupName, rollNo: newSupRollNo, email: newSupEmail, password: newSupPassword }}
              onNewSupervisorChange={(field, value) => {
                if (field === 'name') setNewSupName(value);
                if (field === 'rollNo') setNewSupRollNo(value);
                if (field === 'email') setNewSupEmail(value);
                if (field === 'password') setNewSupPassword(value);
              }}
              onAddSupervisor={handleAddSupervisor}
              supervisors={filteredSupervisors}
              totalSupervisors={adminSupervisors.length}
              search={supervisorSearch}
              onSearchChange={setSupervisorSearch}
              onUpdateEmail={handleUpdateEmail}
              onEditSlots={openSupervisorSlotEditor}
              onToggleNotifications={handleToggleNotifications}
              onDelete={handleDeleteSupervisor}
            />
          </div>
        )}
        {activeTab === 'students' && (
          <div className="min-h-0 lg:h-full">
            <AdminStudentsSection
              students={filteredStudents}
              search={studentSearch}
              onSearchChange={setStudentSearch}
              studentFilter={studentFilter}
              onStudentFilterChange={handleStudentFilterChange}
              filterOptions={filterOptions}
              batchFilter={batchFilter}
              onBatchFilterChange={handleBatchFilterChange}
              batches={studentBatches}
              isLoading={isStudentsLoading}
              pagination={studentPagination}
              page={studentPage}
              onPageChange={handleStudentPageChange}
              onPromoteBatch={handlePromoteBatch}
              onUpdateEmail={handleUpdateEmail}
              onUpdateProgram={handleUpdateProgram}
              onUpdateBatch={handleUpdateBatch}
              onToggleStatus={handleToggleStudentStatus}
            />
          </div>
        )}
        {activeTab === 'reviews' && <AdminProjectReviewsPanel showDialog={showDialog} />}
        {activeTab === 'fines' && <FineManagementPanel showDialog={showDialog} />}
        {activeTab === 'registration' && (
          <RegistrationControlPanel
            initialPolicy={registrationPolicy}
            onPolicyChange={onRegistrationPolicyChange}
          />
        )}
      </DashboardShell>


      <SupervisorSlotEditorDialog
        supervisor={slotEditorSupervisor}
        value={slotEditorValue}
        onValueChange={setSlotEditorValue}
        isSaving={isSlotEditorSaving}
        onClose={closeSupervisorSlotEditor}
        onSave={handleSaveSupervisorExtraSlots}
      />

      <AdminReportsDialog
        open={isReportsModalOpen}
        onClose={() => setIsReportsModalOpen(false)}
        isLoading={isReportsLoading}
        data={reportsData}
        selectedReportId={selectedReportId}
        onSelectedReportChange={setSelectedReportId}
        selectedReport={selectedReport}
        rows={selectedReportRows}
        onRefresh={fetchReportsData}
        onDownloadCsv={handleDownloadCsvReport}
        onDownloadHtml={handleDownloadHtmlReport}
        onOpenReport={handleOpenReportInNewTab}
      />
    </>
  );
};

export default AdminDashboard;
