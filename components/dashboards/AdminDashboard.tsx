'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  AlertCircle,
  BarChart3,
  Download,
  ExternalLink,
  FileText,
  CheckCircle,
  CircleDollarSign,
  Filter,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
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

import { APP_SETTINGS, PROGRAM_MAP } from '../../config/appSettings';
import { MAX_EXTRA_SUPERVISOR_SLOTS } from '../../lib/supervisorSlots';
import RegistrationControlPanel from '../admin/RegistrationControlPanel';
import FineManagementPanel from '../admin/FineManagementPanel';

type AdminTab = 'overview' | 'supervisors' | 'students' | 'registration' | 'fines';

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


type ReportOption = {
  id:
    | 'studentsPerSupervisor'
    | 'studentStatusSummary'
    | 'studentActivitySummary'
    | 'programSummary'
    | 'batchSummary'
    | 'projectStatusSummary'
    | 'projectStageSummary'
    | 'pdfReviewSummary'
    | 'finedStudents';
  label: string;
  description: string;
};

type ReportRow = {
  label: string;
  value: number;
  note?: string;
};

const REPORT_OPTIONS: ReportOption[] = [
  {
    id: 'studentsPerSupervisor',
    label: 'Students per Supervisor',
    description: 'Bar chart showing how many students are assigned to each supervisor.',
  },
  {
    id: 'studentStatusSummary',
    label: 'Student Status Summary',
    description: 'Counts students by portal status such as Pending, Approved, or Unassigned.',
  },
  {
    id: 'studentActivitySummary',
    label: 'Active vs Deactivated Students',
    description: 'Shows active and deactivated student account totals.',
  },
  {
    id: 'programSummary',
    label: 'Students by Program',
    description: 'Shows the student distribution across programs.',
  },
  {
    id: 'batchSummary',
    label: 'Students by Batch',
    description: 'Shows the student distribution across academic batches.',
  },
  {
    id: 'projectStatusSummary',
    label: 'Project Status Report',
    description: 'Shows project counts by current status.',
  },
  {
    id: 'projectStageSummary',
    label: 'Project Stage Report',
    description: 'Shows project counts by Proposal, Thesis Draft, and Final Deliverables.',
  },
  {
    id: 'pdfReviewSummary',
    label: 'PDF Submission and Review Queue',
    description: 'Shows uploaded PDFs, projects waiting for review, and approved projects.',
  },
  {
    id: 'finedStudents',
    label: 'Students Fined',
    description: 'Shows students with outstanding monetary fines and the amount still due.',
  },
];

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const toReportRows = (data: any, reportId: ReportOption['id']): ReportRow[] => {
  if (!data) return [];

  if (reportId === 'studentsPerSupervisor') {
    return (data.studentsPerSupervisor || []).map((item: any) => ({
      label: item.label || 'Unknown Supervisor',
      value: Number(item.total || 0),
      note: `${Number(item.active || 0)} active, ${Number(item.deactivated || 0)} deactivated`,
    }));
  }

  if (reportId === 'studentStatusSummary') {
    return (data.studentStatusSummary || []).map((item: any) => ({
      label: item.label || 'No Status',
      value: Number(item.total || 0),
    }));
  }

  if (reportId === 'studentActivitySummary') {
    return (data.studentActivitySummary || []).map((item: any) => ({
      label: item.label || 'Unknown',
      value: Number(item.total || 0),
    }));
  }

  if (reportId === 'programSummary') {
    return (data.programSummary || []).map((item: any) => ({
      label: getProgramName(item.label || 'No Program'),
      value: Number(item.total || 0),
    }));
  }

  if (reportId === 'batchSummary') {
    return (data.batchSummary || []).map((item: any) => ({
      label: item.label || 'No Batch',
      value: Number(item.total || 0),
    }));
  }

  if (reportId === 'projectStatusSummary') {
    return (data.projectStatusSummary || []).map((item: any) => ({
      label: item.label || 'Pending',
      value: Number(item.total || 0),
    }));
  }

  if (reportId === 'projectStageSummary') {
    return (data.projectStageSummary || []).map((item: any) => ({
      label: item.label || 'PROPOSAL',
      value: Number(item.total || 0),
    }));
  }

  if (reportId === 'finedStudents') {
    return (data.finedStudents || []).map((item: any) => ({
      label: item.label || 'Unknown Student',
      value: Number(item.fineAmount || 0),
      note: `${item.fineBreakdown || `${Number(item.daysLate || 0)} day(s) late`} · ${item.program || 'No Program'} · ${item.batch || 'No Batch'}`,
    }));
  }

  return (data.pdfReviewSummary || []).map((item: any) => ({
    label: item.label || 'Unknown',
    value: Number(item.total || 0),
  }));
};

const buildCsv = (rows: ReportRow[]) => {
  const header = ['Label', 'Value', 'Note'];
  const body = rows.map((row) => [row.label, row.value, row.note || '']);

  return [header, ...body]
    .map((line) =>
      line
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
};

const downloadTextFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const buildReportHtml = (data: any, report: ReportOption, rows: ReportRow[]) => {
  const generatedAt = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleString()
    : new Date().toLocaleString();
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  const totals = data?.totals || {};
  const chartRows = rows
    .map((row) => {
      const width = Math.max((row.value / maxValue) * 100, row.value > 0 ? 4 : 0);

      return `
        <div class="bar-row">
          <div class="bar-label">${escapeHtml(row.label)}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${width}%"></div>
          </div>
          <div class="bar-value">${row.value}</div>
        </div>
        ${row.note ? `<div class="bar-note">${escapeHtml(row.note)}</div>` : ''}
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(report.label)} - FYP Portal Report</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; background: #f4f4f5; color: #18181b; font-family: Arial, sans-serif; }
    .page { max-width: 1040px; margin: 0 auto; padding: 32px 18px; }
    .header { border-radius: 22px; background: #18181b; color: #fff; padding: 28px; }
    .eyebrow { margin: 0 0 8px; color: #a1a1aa; font-size: 12px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
    h1 { margin: 0; font-size: 30px; line-height: 1.2; }
    .description { margin: 10px 0 0; color: #d4d4d8; font-size: 14px; line-height: 1.6; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 18px 0; }
    .card { border: 1px solid #e4e4e7; background: #fff; border-radius: 18px; padding: 16px; }
    .card-label { margin: 0; color: #71717a; font-size: 12px; font-weight: 700; }
    .card-value { margin: 6px 0 0; font-size: 26px; font-weight: 900; }
    .chart { border: 1px solid #e4e4e7; background: #fff; border-radius: 22px; padding: 18px; }
    .bar-row { display: grid; grid-template-columns: 220px 1fr 60px; gap: 12px; align-items: center; margin-top: 12px; }
    .bar-label { font-size: 13px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { height: 20px; border-radius: 999px; background: #f4f4f5; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 999px; background: #2563eb; }
    .bar-value { font-size: 13px; font-weight: 900; text-align: right; }
    .bar-note { margin: 3px 0 0 232px; color: #71717a; font-size: 12px; }
    .table { width: 100%; border-collapse: collapse; margin-top: 18px; overflow: hidden; border-radius: 16px; }
    th, td { border-bottom: 1px solid #e4e4e7; padding: 11px 10px; text-align: left; font-size: 13px; }
    th { background: #fafafa; color: #3f3f46; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    @media (max-width: 760px) { .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } .bar-row { grid-template-columns: 1fr; gap: 6px; } .bar-value { text-align: left; } .bar-note { margin-left: 0; } }
  </style>
</head>
<body>
  <main class="page">
    <section class="header">
      <p class="eyebrow">FYP Portal Report</p>
      <h1>${escapeHtml(report.label)}</h1>
      <p class="description">${escapeHtml(report.description)}</p>
      <p class="description">Generated on ${escapeHtml(generatedAt)}. This report was created in the browser and was not saved to portal storage.</p>
    </section>
    <section class="summary">
      <div class="card"><p class="card-label">Students</p><p class="card-value">${Number(totals.students || 0)}</p></div>
      <div class="card"><p class="card-label">Supervisors</p><p class="card-value">${Number(totals.supervisors || 0)}</p></div>
      <div class="card"><p class="card-label">Projects</p><p class="card-value">${Number(totals.projects || 0)}</p></div>
      <div class="card"><p class="card-label">Review Queue</p><p class="card-value">${Number(totals.reviewQueue || 0)}</p></div>
    </section>
    <section class="chart">
      ${rows.length === 0 ? '<p>No data available for this report.</p>' : chartRows}
      <table class="table">
        <thead><tr><th>Label</th><th>Value</th><th>Note</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.value}</td><td>${escapeHtml(row.note || '')}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
};

const AdminDashboard = ({
  session,
  showDialog,
  registrationPolicy,
  onRegistrationPolicyChange,
}: any) => {
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

  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);
  const [reportsData, setReportsData] = useState<any>(null);
  const [isReportsLoading, setIsReportsLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<ReportOption['id']>('studentsPerSupervisor');


  const [slotEditorSupervisor, setSlotEditorSupervisor] = useState<any>(null);
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
      const response = await fetch('/api/supervisors', { cache: 'no-store' });
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
  };


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

  const openSupervisorSlotEditor = (supervisor: any) => {
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
    } catch (error) {
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
      onConfirm: async (newEmail: string) => {
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
        } catch (error) {
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

        if (isReportsModalOpen) {
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
          description="Core administration areas for accounts, students, and reports."
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
                <BarChart3 size={20} />
              </div>
              <h3 className="text-base font-bold text-[var(--color-text)]">Reports</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                Generate charts for supervisors, students, projects, and review queues without using storage.
              </p>
              <Button className="mt-5 w-full" onClick={openReportsModal}>
                Generate Reports
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
              {filteredSupervisors.map((supervisor) => {
                const filledSlots = Math.max(Number(supervisor.filledSlots || 0), 0);
                const extraSlots = Math.min(
                  Math.max(Number(supervisor.extraSlots || 0), 0),
                  MAX_EXTRA_SUPERVISOR_SLOTS
                );
                const maxSlots = Math.max(
                  Number(supervisor.maxSlots || APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR),
                  APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR
                );

                return (
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
                            {supervisor.isFull ? <Badge variant="danger">Full</Badge> : null}
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
                          onClick={() => openSupervisorSlotEditor(supervisor)}
                          title={`Edit extra slots. Current usage: ${filledSlots} / ${maxSlots}`}
                        >
                          <PlusCircle size={16} />
                          Extra Slots: {extraSlots}/{MAX_EXTRA_SUPERVISOR_SLOTS}
                        </Button>

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
                );
              })}
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
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'supervisors' && (
          <div className="min-h-0 lg:h-full">{renderSupervisors()}</div>
        )}
        {activeTab === 'students' && (
          <div className="min-h-0 lg:h-full">{renderStudents()}</div>
        )}
        {activeTab === 'fines' && <FineManagementPanel showDialog={showDialog} />}
      {activeTab === 'registration' && (
          <RegistrationControlPanel
            initialPolicy={registrationPolicy}
            onPolicyChange={onRegistrationPolicyChange}
          />
        )}
      </DashboardShell>


      <Dialog
        open={Boolean(slotEditorSupervisor)}
        onClose={closeSupervisorSlotEditor}
        title="Edit Extra Slots"
        description={
          slotEditorSupervisor
            ? `Set total extra slots for ${slotEditorSupervisor.name}. Default capacity stays ${APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR}.`
            : undefined
        }
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={closeSupervisorSlotEditor} disabled={isSlotEditorSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveSupervisorExtraSlots} disabled={isSlotEditorSaving}>
              {isSlotEditorSaving ? <Loader2 className="animate-spin" size={16} /> : null}
              Save Slots
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm leading-6 text-[var(--color-text-muted)]">
            Enter total extra slots from 0 to {MAX_EXTRA_SUPERVISOR_SLOTS}. For example, if current extra slots are 4, the maximum future increase is 6.
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[var(--color-text)]">
              Extra Slots
            </label>
            <input
              autoFocus
              type="number"
              min={0}
              max={MAX_EXTRA_SUPERVISOR_SLOTS}
              step={1}
              value={slotEditorValue}
              onChange={(event) => setSlotEditorValue(event.target.value)}
              className="h-11 w-24 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-center text-sm font-black text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
            />
            <p className="mt-2 text-xs font-semibold text-[var(--color-text-muted)]">
              Allowed range: 0 to {MAX_EXTRA_SUPERVISOR_SLOTS}
            </p>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={isReportsModalOpen}
        onClose={() => setIsReportsModalOpen(false)}
        title="Admin Reports"
        description="Open reports in a temporary browser tab, or download HTML/CSV only when needed. Nothing is saved to portal storage."
        size="xl"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button variant="outline" onClick={() => setIsReportsModalOpen(false)}>
              Close
            </Button>
            <Button variant="outline" disabled={!reportsData || selectedReportRows.length === 0} onClick={handleDownloadCsvReport}>
              <Download size={16} />
              CSV
            </Button>
            <Button variant="outline" disabled={!reportsData || selectedReportRows.length === 0} onClick={handleDownloadHtmlReport}>
              <FileText size={16} />
              HTML
            </Button>
            <Button disabled={!reportsData || selectedReportRows.length === 0} onClick={handleOpenReportInNewTab}>
              <ExternalLink size={16} />
              Open Report
            </Button>
          </div>
        }
      >
        {isReportsLoading ? (
          <div className="flex min-h-80 flex-col items-center justify-center">
            <Loader2 className="mb-3 animate-spin text-[var(--color-accent)]" size={36} />
            <p className="text-sm font-bold text-[var(--color-text)]">Loading reports...</p>
          </div>
        ) : !reportsData ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
            <BarChart3 className="mx-auto mb-3 text-[var(--color-text-muted)]" size={32} />
            <p className="text-sm font-bold text-[var(--color-text)]">No report data loaded</p>
            <Button className="mt-4" onClick={fetchReportsData}>
              Load Reports
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <Select
                value={selectedReportId}
                onChange={(event) => setSelectedReportId(event.target.value as ReportOption['id'])}
                aria-label="Select report type"
              >
                {REPORT_OPTIONS.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.label}
                  </option>
                ))}
              </Select>

              <Button variant="outline" onClick={fetchReportsData} disabled={isReportsLoading}>
                {isReportsLoading ? <Loader2 className="animate-spin" size={16} /> : <BarChart3 size={16} />}
                Refresh Data
              </Button>
            </div>

            <DashboardGrid columns="four">
              <StatCard
                label="Students"
                value={reportsData.totals?.students || 0}
                hint="Total student accounts"
                icon={<Users size={18} />}
              />
              <StatCard
                label="Supervisors"
                value={reportsData.totals?.supervisors || 0}
                hint="Total supervisor accounts"
                icon={<UserCheck size={18} />}
              />
              <StatCard
                label="Projects"
                value={reportsData.totals?.projects || 0}
                hint="Total project records"
                icon={<FileText size={18} />}
              />
              <StatCard
                label="Review Queue"
                value={reportsData.totals?.reviewQueue || 0}
                hint="PDF projects not approved"
                icon={<AlertCircle size={18} />}
              />
              <StatCard
                label="Students Fined"
                value={reportsData.totals?.finedStudents || 0}
                hint={`Total amount: PKR ${Number(reportsData.totals?.totalFineAmount || 0).toLocaleString()}`}
                icon={<AlertCircle size={18} />}
              />
            </DashboardGrid>

            <DashboardPanel className="bg-[var(--color-surface-muted)]">
              <SectionHeader
                title={selectedReport.label}
                description={`${selectedReport.description} Generated ${new Date(reportsData.generatedAt).toLocaleString()}.`}
              />

              {selectedReportRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
                  <BarChart3 className="mx-auto mb-3 text-[var(--color-text-muted)]" size={32} />
                  <p className="text-sm font-bold text-[var(--color-text)]">No data available for this report</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedReportRows.map((row) => {
                    const maxValue = Math.max(...selectedReportRows.map((item) => item.value), 1);
                    const width = Math.max((row.value / maxValue) * 100, row.value > 0 ? 4 : 0);

                    return (
                      <div key={row.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[var(--color-text)]">{row.label}</p>
                            {row.note && (
                              <p className="truncate text-xs font-semibold text-[var(--color-text-muted)]">{row.note}</p>
                            )}
                          </div>
                          <span className="text-sm font-black text-[var(--color-text)]">{row.value}</span>
                        </div>

                        <div className="h-3 overflow-hidden rounded-full bg-[var(--color-border)]">
                          <div
                            className="h-full rounded-full bg-[var(--color-primary)]"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </DashboardPanel>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm leading-6 text-[var(--color-text-muted)]">
              Reports are generated from aggregated counts returned by the API. Downloaded HTML and CSV files are created in your browser with Blob URLs, so they do not consume R2 storage or create saved report files on Vercel.
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
};

export default AdminDashboard;