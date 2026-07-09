
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  AlertCircle,
  CheckCircle,
  Filter,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  LogIn,
  Mail,
  MailX,
  Megaphone,
  Network,
  PlusCircle,
  Search,
  ShieldCheck,
  Trash2,
  User,
  UserCheck,
  Users,
} from 'lucide-react';

import {
  AvatarBadge,
  Badge,
  Button,
  DashboardGrid,
  DashboardPanel,
  DashboardShell,
  Dialog,
  LinkifiedText,
  SectionHeader,
  Select,
  StatCard,
  StyledInput,
} from '../ui/SharedUI';

import { PROGRAM_MAP } from '../../config/appSettings';

type AdminTab = 'overview' | 'supervisors' | 'students';

const getStatusVariant = (status?: string) => {
  if (status === 'Approved') return 'success';
  if (status === 'Rejected') return 'danger';
  if (status === 'Unassigned') return 'muted';
  return 'warning';
};

const getProgramName = (program?: string) => {
  if (!program) return 'No program';
  return PROGRAM_MAP[program as keyof typeof PROGRAM_MAP] || program;
};

const AdminDashboard = ({ session, showDialog }: any) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

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

  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false);
  const [graphData, setGraphData] = useState<any>({ supervisors: [], students: [] });
  const [isGraphLoading, setIsGraphLoading] = useState(false);

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
      const currentStudents = bySupervisor.get(supervisorId) || [];

      currentStudents.push(student);
      bySupervisor.set(supervisorId, currentStudents);
    });

    return {
      bySupervisor,
      unassigned,
      totalStudents: students.length,
    };
  }, [graphData.students]);

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

  const fetchHeadline = async () => {
    try {
      const response = await fetch('/api/headline');
      const data = await response.json();

      setCurrentHeadline(data.headline?.text || '');
    } catch (error) {
      console.error('Headline fetch error:', error);
    }
  };

  const fetchSupervisors = async () => {
    try {
      const response = await fetch('/api/supervisors');
      const data = await response.json();

      setAdminSupervisors(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Supervisor fetch error:', error);
    }
  };

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

      const response = await fetch(`/api/admin/students?${params.toString()}`);
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
  };

  const fetchGraphData = async () => {
    setIsGraphLoading(true);

    try {
      const response = await fetch('/api/admin/graph-data');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load assignment map');
      }

      setGraphData({
        supervisors: Array.isArray(data.supervisors) ? data.supervisors : [],
        students: Array.isArray(data.students) ? data.students : [],
      });
    } catch (error) {
      console.error('Assignment map error:', error);
      showDialog({
        title: 'Assignment map unavailable',
        message: 'Unable to load the supervisor-student assignment map right now.',
      });
    } finally {
      setIsGraphLoading(false);
    }
  };

  const openGraphModal = async () => {
    setIsGraphModalOpen(true);
    await fetchGraphData();
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
        } catch (error) {
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
    } catch (error) {
      showDialog({
        title: 'Connection error',
        message: 'Unable to update notification settings right now.',
      });
    }
  };

  const handleUpdateEmail = async (userId: string, currentEmail: string, name: string) => {
    showDialog({
      type: 'prompt',
      inputType: 'email',
      title: 'Update email',
      message: `Enter a new email address for ${name}.`,
      defaultValue: currentEmail || '',
      onConfirm: async (newEmail: string) => {
        if (!newEmail || newEmail === currentEmail) return;

        const response = await fetch('/api/admin/update-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: userId, newEmail }),
        });

        if (response.ok) {
          showDialog({ title: 'Email updated', message: 'The email address has been updated.' });
          fetchSupervisors();
          fetchStudents();
        } else {
          showDialog({ title: 'Update failed', message: 'Failed to update email.' });
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
      onConfirm: async (newProgram: string) => {
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
      onConfirm: async (newBatch: string) => {
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

        if (isGraphModalOpen) {
          fetchGraphData();
        }
      } else {
        showDialog({
          title: 'Status update failed',
          message: 'Failed to update student account status.',
        });
      }
    } catch (error) {
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

  const renderOverview = () => (
    <div className="space-y-7 sm:space-y-6">
      <DashboardGrid columns="four">
        <StatCard
          label="Total Students"
          value={stats.totalStudents}
          hint={`${stats.loadedStudents} visible in current view`}
          icon={<Users size={18} />}
        />
        <StatCard
          label="Supervisors"
          value={stats.supervisors}
          hint="Active supervisor accounts"
          icon={<UserCheck size={18} />}
        />
        <StatCard
          label="Active Students"
          value={stats.activeStudents}
          hint="Based on loaded student records"
          icon={<ShieldCheck size={18} />}
        />
        <StatCard
          label="Pending Items"
          value={stats.pendingStudents}
          hint="Students not marked approved"
          icon={<AlertCircle size={18} />}
        />
      </DashboardGrid>

      <section>
        <SectionHeader
          title="Management"
          description="Core administration areas for accounts, students, and project assignments."
        />

        <DashboardGrid columns="three">
          <DashboardPanel>
            <div className="flex h-full flex-col">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
                <Users size={20} />
              </div>
              <h3 className="text-base font-bold text-[var(--color-text)]">Supervisor Management</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                Create supervisor accounts, manage email, notification status, and access.
              </p>
              <Button className="mt-5 w-full" onClick={() => setActiveTab('supervisors')}>
                Open Supervisors
              </Button>
            </div>
          </DashboardPanel>

          <DashboardPanel>
            <div className="flex h-full flex-col">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
                <GraduationCap size={20} />
              </div>
              <h3 className="text-base font-bold text-[var(--color-text)]">Student Management</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                Search students, update batch/program/email, and manage account status.
              </p>
              <Button className="mt-5 w-full" onClick={() => setActiveTab('students')}>
                Open Students
              </Button>
            </div>
          </DashboardPanel>

          <DashboardPanel>
            <div className="flex h-full flex-col">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
                <Network size={20} />
              </div>
              <h3 className="text-base font-bold text-[var(--color-text)]">Assignment Map</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                Review supervisor-student assignments in a clean structured view.
              </p>
              <Button className="mt-5 w-full" onClick={openGraphModal}>
                View Assignments
              </Button>
            </div>
          </DashboardPanel>
        </DashboardGrid>
      </section>

      <DashboardPanel>
        <SectionHeader
          title="Announcement Center"
          description="Publish a headline announcement visible to students."
        />

        <form onSubmit={handleBroadcastHeadline} className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <StyledInput
            value={headlineInput}
            onChange={(event: any) => setHeadlineInput(event.target.value)}
            placeholder="Write a concise portal announcement..."
          />

          <div className="grid gap-2 sm:grid-cols-2 lg:flex">
            <Button type="submit">
              <Megaphone size={16} />
              Broadcast
            </Button>
            <Button type="button" variant="outline" onClick={clearHeadline}>
              <Trash2 size={16} />
              Clear
            </Button>
          </div>
        </form>

        {currentHeadline ? (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
              Current announcement
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text)]">
              <LinkifiedText text={currentHeadline} />
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--color-text-muted)]">
            No active announcement is currently published.
          </p>
        )}
      </DashboardPanel>
    </div>
  );

  const renderSupervisors = () => (
    <div className="grid gap-7 sm:gap-6 xl:h-full xl:min-h-0 xl:grid-cols-[0.8fr_1.2fr]">
      <DashboardPanel className="h-fit xl:sticky xl:top-0">
        <SectionHeader
          title="Add Supervisor"
          description="Create a supervisor account with login credentials."
        />

        <form onSubmit={handleAddSupervisor} className="space-y-4">
          <StyledInput
            value={newSupName}
            onChange={(event: any) => setNewSupName(event.target.value)}
            type="text"
            required
            placeholder="Full name"
          />
          <StyledInput
            value={newSupRollNo}
            onChange={(event: any) => setNewSupRollNo(event.target.value)}
            type="text"
            required
            placeholder="Username ID"
          />
          <StyledInput
            value={newSupEmail}
            onChange={(event: any) => setNewSupEmail(event.target.value)}
            type="email"
            required
            placeholder="Supervisor email"
          />
          <StyledInput
            value={newSupPassword}
            onChange={(event: any) => setNewSupPassword(event.target.value)}
            type="text"
            required
            placeholder="Assign password"
          />

          <Button type="submit" className="w-full">
            <PlusCircle size={16} />
            Create Account
          </Button>
        </form>
      </DashboardPanel>

      <DashboardPanel className="flex flex-col xl:h-full xl:min-h-0 xl:overflow-hidden">
        <div className="shrink-0">
          <SectionHeader
            title="Active Supervisors"
            description={`${filteredSupervisors.length}${
              supervisorSearch.trim() ? ` of ${adminSupervisors.length}` : ''
            } supervisor accounts`}
          />

          <StyledInput
            icon={Search}
            value={supervisorSearch}
            onChange={(event: any) => setSupervisorSearch(event.target.value)}
            type="search"
            placeholder="Search by name, ID, email, or migration code..."
          />
        </div>

        <div className="portal-scrollbar mt-5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
          {filteredSupervisors.length === 0 ? (
            <div className="flex min-h-60 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
              <Users className="mb-3 text-[var(--color-text-muted)]" size={28} />
              <p className="text-sm font-semibold text-[var(--color-text)]">
                No supervisors found
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Try another search term or create a new supervisor account.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSupervisors.map((supervisor) => (
                <div
                  key={supervisor._id}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <AvatarBadge name={supervisor.name} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-[var(--color-text)]">{supervisor.name}</h3>
                          <Badge variant="muted">{supervisor.rollNo || 'No ID'}</Badge>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateEmail(supervisor._id, supervisor.email, supervisor.name)
                          }
                          className="mt-1 break-all text-left text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                        >
                          {supervisor.email || 'Assign email'}
                        </button>

                        <p className="mt-2 text-xs font-semibold text-[var(--color-text-muted)]">
                          Migration Code:{' '}
                          <span className="font-mono text-[var(--color-text)]">
                            {supervisor.migrationCode || 'N/A'}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          handleToggleNotifications(supervisor._id, supervisor.notificationsEnabled)
                        }
                        title="Toggle notifications"
                      >
                        {supervisor.notificationsEnabled ? <Mail size={16} /> : <MailX size={16} />}
                        {supervisor.notificationsEnabled ? 'Notifications On' : 'Notifications Off'}
                      </Button>

                      <Button
                        variant="danger"
                        onClick={() => handleDeleteSupervisor(supervisor._id, supervisor.name)}
                      >
                        <Trash2 size={16} />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DashboardPanel>
    </div>
  );

  const renderStudents = () => (
    <DashboardPanel className="flex flex-col xl:h-full xl:min-h-0 xl:overflow-hidden">
      <div className="shrink-0">
        <SectionHeader
          title="Students"
          description="Search, filter, and manage student academic records."
          action={
            batchFilter !== 'All' ? (
              <Button variant="accent" onClick={handlePromoteBatch}>
                Promote {batchFilter}
              </Button>
            ) : null
          }
        />

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(16rem,1fr)_12rem_12rem]">
            <StyledInput
              icon={Search}
              value={studentSearch}
              onChange={(event: any) => setStudentSearch(event.target.value)}
              type="search"
              placeholder="Search students by name, ID, or email..."
            />

            <Select
              value={studentFilter}
              onChange={(event) => handleStudentFilterChange(event.target.value)}
              aria-label="Filter students by program or status"
            >
              {filterOptions.map((option) => (
                <option key={option} value={option}>
                  {Object.keys(PROGRAM_MAP).includes(option) ? option : option}
                </option>
              ))}
            </Select>

            <Select
              value={batchFilter}
              onChange={(event) => handleBatchFilterChange(event.target.value)}
              aria-label="Filter students by batch"
            >
              <option value="All">All Batches</option>
              {studentBatches.map((batch) => (
                <option key={batch} value={batch}>
                  {batch}
                </option>
              ))}
            </Select>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1 uppercase tracking-wide">
              <Filter size={13} />
              Active filters
            </span>
            <Badge variant={studentFilter === 'All' ? 'muted' : 'accent'}>
              {studentFilter === 'All' ? 'All Programs & Statuses' : studentFilter}
            </Badge>
            <Badge variant={batchFilter === 'All' ? 'muted' : 'accent'}>
              {batchFilter === 'All' ? 'All Batches' : batchFilter}
            </Badge>
          </div>
        </div>
      </div>

      <div className="portal-scrollbar mt-5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
        {isStudentsLoading ? (
          <div className="flex min-h-60 flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
            <Loader2 size={32} className="mb-3 animate-spin text-[var(--color-accent)]" />
            <p className="text-sm font-bold text-[var(--color-text)]">Loading students...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="flex min-h-60 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
            <User size={32} className="mb-3 text-[var(--color-text-muted)]" />
            <p className="text-sm font-bold text-[var(--color-text)]">No students found</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Adjust your search or filters and try again.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredStudents.map((student) => (
              <div
                key={student._id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <AvatarBadge
                      name={student.name}
                      className={student.isActive === false ? 'opacity-50' : ''}
                    />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className={`font-bold text-[var(--color-text)] ${
                            student.isActive === false ? 'line-through opacity-60' : ''
                          }`}
                        >
                          {student.name || 'Unnamed student'}
                        </h3>

                        <Badge variant={getStatusVariant(student.status) as any}>
                          {student.status || 'N/A'}
                        </Badge>

                        {student.isActive === false && <Badge variant="danger">Deactivated</Badge>}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUpdateEmail(student._id, student.email, student.name)}
                        className="mt-1 break-all text-left text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                      >
                        ID: {student.rollNo || 'N/A'} · {student.email || 'Assign email'}
                      </button>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateProgram(student._id, student.program, student.name)
                          }
                          className="rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-bold text-[var(--color-accent)]"
                          title={`${getProgramName(student.program)} — click to edit`}
                        >
                          {student.program || 'No program'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUpdateBatch(student._id, student.batch, student.name)}
                          className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                          title="Click to edit batch"
                        >
                          {student.batch || 'No batch'} · {student.semester || '7th Sem'}
                        </button>

                        {student.monthlyLoginCount > 0 && (
                          <Badge variant="accent">{student.monthlyLoginCount} logins this month</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={student.isActive !== false ? 'danger' : 'success'}
                      onClick={() =>
                        handleToggleStudentStatus(student._id, student.isActive !== false)
                      }
                    >
                      {student.isActive !== false ? <Trash2 size={16} /> : <CheckCircle size={16} />}
                      {student.isActive !== false ? 'Deactivate' : 'Restore'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex shrink-0 flex-col gap-3 border-t border-[var(--color-border)] pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold text-[var(--color-text-muted)]">
          Showing {filteredStudents.length} of {studentPagination.total} students
        </p>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={isStudentsLoading || studentPage <= 1}
            onClick={() => handleStudentPageChange(studentPage - 1)}
          >
            Previous
          </Button>

          <span className="text-sm font-bold text-[var(--color-text-muted)]">
            Page {studentPagination.total === 0 ? 0 : studentPage} of {studentPagination.totalPages}
          </span>

          <Button
            variant="outline"
            disabled={isStudentsLoading || studentPage >= studentPagination.totalPages}
            onClick={() => handleStudentPageChange(studentPage + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </DashboardPanel>
  );

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
      id: 'assignments',
      label: 'Assignment Map',
      icon: <Network size={18} />,
      onClick: openGraphModal,
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
            <Button variant="outline" onClick={openGraphModal}>
              <Network size={16} />
              Assignment Map
            </Button>

            <Button variant="danger" onClick={() => signOut({ redirect: false })}>
              <LogIn size={16} className="rotate-180" />
              Logout
            </Button>
          </div>
        }
      >
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'supervisors' && (
          <div className="min-h-0 lg:h-full">{renderSupervisors()}</div>
        )}
        {activeTab === 'students' && (
          <div className="min-h-0 lg:h-full">{renderStudents()}</div>
        )}
      </DashboardShell>

      <Dialog
        open={isGraphModalOpen}
        onClose={() => setIsGraphModalOpen(false)}
        title="Supervisor Assignment Map"
        description="A structured overview of supervisor-student assignments."
        size="xl"
        footer={
          <Button variant="outline" onClick={() => setIsGraphModalOpen(false)}>
            Close
          </Button>
        }
      >
        {isGraphLoading ? (
          <div className="flex min-h-80 flex-col items-center justify-center">
            <Loader2 className="mb-3 animate-spin text-[var(--color-accent)]" size={36} />
            <p className="text-sm font-bold text-[var(--color-text)]">Loading assignment map...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {graphData.supervisors.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
                <Network className="mx-auto mb-3 text-[var(--color-text-muted)]" size={32} />
                <p className="text-sm font-bold text-[var(--color-text)]">No assignment data found</p>
              </div>
            ) : (
              graphData.supervisors.map((supervisor: any) => {
                const assignedStudents =
                  graphStudentGroups.bySupervisor.get(String(supervisor._id)) || [];

                return (
                  <div
                    key={supervisor._id}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <AvatarBadge name={supervisor.name} />
                        <div>
                          <h3 className="font-bold text-[var(--color-text)]">{supervisor.name}</h3>
                          <p className="text-sm text-[var(--color-text-muted)]">
                            {assignedStudents.length} assigned student
                            {assignedStudents.length === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      {assignedStudents.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm font-semibold text-[var(--color-text-muted)]">
                          No students assigned
                        </div>
                      ) : (
                        assignedStudents.map((student: any) => (
                          <div
                            key={student._id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"
                          >
                            <div className="min-w-0">
                              <p
                                className={`truncate text-sm font-bold text-[var(--color-text)] ${
                                  student.isActive === false ? 'line-through opacity-60' : ''
                                }`}
                              >
                                {student.name}
                              </p>
                              <p className="truncate text-xs text-[var(--color-text-muted)]">
                                {student.rollNo || 'No roll number'}
                              </p>
                            </div>

                            <Button
                              variant={student.isActive !== false ? 'danger' : 'success'}
                              className="min-h-9 px-3 text-xs"
                              onClick={() =>
                                handleToggleStudentStatus(
                                  student._id,
                                  student.isActive !== false
                                )
                              }
                            >
                              {student.isActive !== false ? 'Deactivate' : 'Restore'}
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {graphStudentGroups.unassigned.length > 0 && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <h3 className="font-bold text-[var(--color-text)]">Unassigned Students</h3>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {graphStudentGroups.unassigned.map((student: any) => (
                    <div
                      key={student._id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[var(--color-text)]">
                          {student.name}
                        </p>
                        <p className="truncate text-xs text-[var(--color-text-muted)]">
                          {student.rollNo || 'No roll number'}
                        </p>
                      </div>

                      <Badge variant="muted">Unassigned</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
};

export default AdminDashboard;