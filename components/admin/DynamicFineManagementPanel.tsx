'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BadgeDollarSign,
  Ban,
  CircleDollarSign,
  Download,
  FileCheck2,
  Loader2,
  Pause,
  Play,
  RefreshCcw,
  Search,
  ShieldCheck,
} from 'lucide-react';

import type { ShowDialog } from '../../app/_components/PortalDialog';
import { downloadTextFile } from './reports/downloadTextFile';
import {
  Badge,
  Button,
  DashboardGrid,
  DashboardPanel,
  SectionHeader,
  Select,
  StatCard,
  StyledInput,
  TextArea,
} from '../ui/SharedUI';

type FineTypeView = { _id: string; code: string; name: string; category: string; active: boolean };
type PolicyView = {
  _id: string;
  fineTypeId: string;
  version: number;
  trigger: string;
  status: 'active' | 'paused' | 'inactive';
  deadline?: string | null;
  submissionStage?: string | null;
};
type StudentView = { _id: string; name: string; rollNo: string; program?: string; batch?: string };
type PopulatedFineType = { _id: string; name: string; code: string };
type FineView = {
  _id: string;
  studentId: StudentView;
  fineTypeId: PopulatedFineType;
  title: string;
  reason: string;
  currentAmount: number;
  settledAmount?: number;
  status: string;
  policyVersion: number;
  policyRestrictions?: string[];
  restrictionOverride?: string[];
  restorationSnapshots?: Array<{ action: string }>;
  createdAt: string;
};
type PaymentView = {
  _id: string;
  studentId: StudentView;
  fineIds: string[];
  reference: string;
  paidAmount: number;
  paymentDate: string;
  proofKey?: string | null;
  status: string;
  rejectionReason?: string;
};
type AuditView = {
  _id: string;
  entityType: string;
  action: string;
  details: string;
  createdAt: string;
};
type RestrictionRuleView = {
  _id: string;
  scope: string;
  label: string;
  restrictions: string[];
  fineTypeId?: string | null;
  program?: string | null;
  batch?: string | null;
  projectId?: string | null;
  studentId?: string | null;
  fineRecordId?: string | null;
};
type FineAdminData = {
  overview: {
    outstandingAmount: number;
    collectedAmount: number;
    waivedAmount: number;
    finedStudents: number;
    restrictedStudents: number;
    activePolicies: number;
    pendingPaymentVerifications: number;
    loginBlocked: number;
    projectsBlocked: number;
  };
  fineTypes: FineTypeView[];
  policies: PolicyView[];
  restrictionRules: RestrictionRuleView[];
  fines: FineView[];
  payments: PaymentView[];
  audits: AuditView[];
  report: Array<{
    _id: { fineTypeId: string; status: string };
    count: number;
    amount: number;
    settled: number;
  }>;
  pagination: { page: number; total: number; totalPages: number; auditTotal: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFineAdminData(value: unknown): value is FineAdminData {
  return isRecord(value)
    && isRecord(value.overview)
    && Array.isArray(value.fineTypes)
    && Array.isArray(value.policies)
    && Array.isArray(value.restrictionRules)
    && Array.isArray(value.fines)
    && Array.isArray(value.payments)
    && Array.isArray(value.audits)
    && Array.isArray(value.report)
    && isRecord(value.pagination);
}

async function responseRecord(response: Response) {
  const value: unknown = await response.json();
  if (!isRecord(value)) throw new Error('The server returned an invalid fine response.');
  if (!response.ok) throw new Error(String(value.error || 'Unable to update the fine system.'));
  return value;
}

async function adminAction(method: 'POST' | 'PATCH', payload: Record<string, unknown>) {
  return responseRecord(await fetch('/api/admin/fine-system', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
}

const money = (value: unknown) => `PKR ${Math.max(Number(value) || 0, 0).toLocaleString()}`;
const dateInput = () => new Date().toISOString().slice(0, 10);
const emptyFilters = () => ({
  program: '',
  batch: '',
  fineTypeId: '',
  restriction: '',
  dateFrom: '',
  dateTo: '',
  projectId: '',
  supervisorId: '',
});

export default function DynamicFineManagementPanel({ showDialog }: { showDialog: ShowDialog }) {
  const [data, setData] = useState<FineAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [filterInputs, setFilterInputs] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [newType, setNewType] = useState({ code: '', name: '', description: '', category: 'manual' });
  const [policy, setPolicy] = useState({
    fineTypeId: '',
    deadline: dateInput(),
    method: 'fixed',
    fixedAmount: '0',
    startingAmount: '0',
    dailyAmount: '0',
    maximumAmount: '',
    stage: '',
  });
  const [manual, setManual] = useState({
    fineTypeId: '',
    studentIds: '',
    title: '',
    reason: '',
    amount: '',
    dueDate: dateInput(),
    restrictions: 'none',
  });
  const [rule, setRule] = useState({
    scope: 'global',
    label: '',
    restriction: 'none',
    fineTypeId: '',
    studentId: '',
    program: '',
    batch: '',
    projectId: '',
    fineRecordId: '',
  });
  const [offline, setOffline] = useState({
    studentId: '',
    fineIds: '',
    reference: '',
    paidAmount: '',
    paymentDate: dateInput(),
    reason: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), limit: '25', status });
      if (activeSearch) query.set('search', activeSearch);
      for (const [key, value] of Object.entries(filters)) {
        if (value.trim()) query.set(key, value.trim());
      }
      const value: unknown = await (await fetch(`/api/admin/fine-system?${query}`, { cache: 'no-store' })).json();
      if (!isRecord(value)) throw new Error('The server returned an invalid fine response.');
      if ('error' in value) throw new Error(String(value.error));
      if (!isFineAdminData(value)) throw new Error('The fine response is incomplete.');
      setData(value);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load dynamic fines.');
    } finally {
      setLoading(false);
    }
  }, [activeSearch, filters, page, status]);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ page: String(page), limit: '25', status });
    if (activeSearch) query.set('search', activeSearch);
    for (const [key, value] of Object.entries(filters)) {
      if (value.trim()) query.set(key, value.trim());
    }
    void fetch(`/api/admin/fine-system?${query}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((value: unknown) => {
        if (cancelled) return;
        if (!isRecord(value)) throw new Error('The server returned an invalid fine response.');
        if ('error' in value) throw new Error(String(value.error));
        if (!isFineAdminData(value)) throw new Error('The fine response is incomplete.');
        setData(value);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load dynamic fines.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSearch, filters, page, status]);

  const run = async (key: string, method: 'POST' | 'PATCH', payload: Record<string, unknown>) => {
    setBusy(key);
    try {
      await adminAction(method, payload);
      await load();
      showDialog({ title: 'Fine system updated', message: 'The action completed and was added to the audit history.' });
    } catch (actionError) {
      showDialog({
        title: 'Fine action failed',
        message: actionError instanceof Error ? actionError.message : 'Unable to update the fine system.',
      });
    } finally {
      setBusy('');
    }
  };

  const verifyPayment = async (payment: PaymentView) => {
    try {
      const result = await adminAction('POST', {
        action: 'previewPaymentClearance',
        paymentId: payment._id,
      });
      const preview = isRecord(result.preview) ? result.preview : {};
      const student = isRecord(preview.student) ? preview.student : {};
      const previousRelationships = Array.isArray(preview.previousRelationships) ? preview.previousRelationships : [];
      const manualRestoration = Array.isArray(preview.manualRestoration) ? preview.manualRestoration : [];
      const reason = window.prompt('Administrative verification reason:');
      if (!reason?.trim()) return;
      showDialog({
        type: 'confirm',
        title: `Verify ${payment.reference}?`,
        message: `${String(student.name || payment.studentId.name)} has ${Array.isArray(preview.fineIds) ? preview.fineIds.length : payment.fineIds.length} selected fine record(s), with ${money(preview.outstandingAmount)} outstanding. Payment ${String(preview.paymentReference || payment.reference)} will settle ${money(preview.settledAmount)} and remove ${Array.isArray(preview.restrictionsToRemove) ? preview.restrictionsToRemove.length : 0} restriction source(s). ${previousRelationships.length} previous relationship snapshot(s) require current capacity checks. ${manualRestoration.length ? manualRestoration.join(' ') : 'No relationship will be silently recreated.'}`,
        onConfirm: () => run(`verify:${payment._id}`, 'PATCH', {
          action: 'verifyPaymentAndClear',
          paymentId: payment._id,
          reason,
          confirm: true,
        }),
      });
    } catch (previewError) {
      showDialog({ title: 'Clearance preview failed', message: previewError instanceof Error ? previewError.message : 'Unable to preview clearance.' });
    }
  };

  const rejectPayment = (payment: PaymentView) => {
    const reason = window.prompt(`Why is payment ${payment.reference} being rejected?`);
    if (!reason?.trim()) return;
    void run(`reject:${payment._id}`, 'PATCH', { action: 'rejectPayment', paymentId: payment._id, reason });
  };

  const waive = (fine: FineView) => {
    const reason = window.prompt(`Administrative reason to waive “${fine.title}”:`);
    if (!reason?.trim()) return;
    showDialog({
      type: 'confirm',
      title: `Waive ${fine.title}?`,
      message: 'The fine will remain as a historical record and its fine-related restrictions will stop contributing.',
      onConfirm: () => run(`waive:${fine._id}`, 'PATCH', { action: 'waiveFine', fineId: fine._id, reason, confirm: true }),
    });
  };

  const adjust = (fine: FineView, kind: 'discount' | 'charge') => {
    const amount = window.prompt(`${kind === 'discount' ? 'Discount' : 'Additional charge'} amount in PKR:`);
    if (!amount) return;
    const reason = window.prompt('Administrative reason:');
    if (!reason?.trim()) return;
    showDialog({
      type: 'confirm',
      title: `${kind === 'discount' ? 'Discount' : 'Charge'} ${fine.title}?`,
      message: `${money(amount)} will be recorded as a separate adjustment. The base calculation and prior settlements remain intact.`,
      onConfirm: () => run(`adjust:${fine._id}`, 'PATCH', {
        action: 'adjustFine',
        fineId: fine._id,
        kind,
        amount: Number(amount),
        reason,
        confirm: true,
      }),
    });
  };

  const correct = (fine: FineView) => {
    const amount = window.prompt('Corrected current amount in PKR:', String(fine.currentAmount));
    if (!amount) return;
    const reason = window.prompt('Administrative correction reason:');
    if (!reason?.trim()) return;
    showDialog({
      type: 'confirm',
      title: `Correct ${fine.title}?`,
      message: `The base amount will change from ${money(fine.currentAmount)} to ${money(amount)}. The old amount remains reconstructable from audit history.`,
      onConfirm: () => run(`correct:${fine._id}`, 'PATCH', {
        action: 'correctFineAmount',
        fineId: fine._id,
        currentAmount: Number(amount),
        reason,
        confirm: true,
      }),
    });
  };

  const restore = async (fine: FineView) => {
    const mode = window.prompt('Restoration mode: team, supervisor, both, or leave-unassigned', 'both');
    if (mode !== 'team' && mode !== 'supervisor' && mode !== 'both' && mode !== 'leave-unassigned') return;
    const reason = window.prompt('Administrative restoration reason:');
    if (!reason?.trim()) return;
    try {
      const result = await adminAction('POST', { action: 'previewRestoration', fineId: fine._id });
      const preview = isRecord(result.preview) ? result.preview : {};
      showDialog({
        type: 'confirm',
        title: `Restore ${mode.replaceAll('-', ' ')}?`,
        message: `${isRecord(preview.project) ? String(preview.project.title || 'The previous project') : 'The previous relationship'} will be revalidated for account, team, and supervisor capacity before any write occurs.`,
        onConfirm: () => run(`restore:${fine._id}`, 'PATCH', {
          action: 'restoreRelationships',
          fineId: fine._id,
          mode,
          reason,
          confirm: true,
        }),
      });
    } catch (previewError) {
      showDialog({ title: 'Restoration preview failed', message: previewError instanceof Error ? previewError.message : 'Unable to preview restoration.' });
    }
  };

  const changePolicyStatus = (item: PolicyView, nextStatus: 'active' | 'paused' | 'inactive') => {
    const reason = window.prompt(`Reason to mark this policy ${nextStatus}:`);
    if (!reason?.trim()) return;
    void run(`policy:${item._id}`, 'PATCH', {
      action: 'changePolicyStatus',
      policyId: item._id,
      status: nextStatus,
      reason,
    });
  };

  const changeDeadline = (item: PolicyView) => {
    const newDeadline = window.prompt('New deadline (YYYY-MM-DD):', item.deadline?.slice(0, 10) || dateInput());
    if (!newDeadline) return;
    void adminAction('POST', { action: 'previewDeadlineChange', policyId: item._id, newDeadline })
      .then((result) => {
        const preview = isRecord(result.preview) ? result.preview : {};
        const reason = window.prompt('Administrative reason for the deadline change:');
        if (!reason?.trim()) return;
        showDialog({
          type: 'confirm',
          title: 'Apply deadline change?',
          message: `${Number(preview.affectedStudents || 0)} student(s) are affected. The projected total changes from ${money(preview.previousTotalAmount)} to ${money(preview.projectedTotalAmount)}. Paid, waived, and cancelled fines remain untouched.`,
          onConfirm: () => run(`deadline:${item._id}`, 'PATCH', {
            action: 'applyDeadlineChange',
            policyId: item._id,
            newDeadline,
            mode: 'all-unresolved',
            reason,
            confirm: true,
          }),
        });
      })
      .catch((previewError: unknown) => showDialog({
        title: 'Deadline preview failed',
        message: previewError instanceof Error ? previewError.message : 'Unable to preview the deadline change.',
      }));
  };

  const createType = (event: FormEvent) => {
    event.preventDefault();
    void run('create-type', 'POST', {
      action: 'createFineType',
      ...newType,
      defaultRestrictions: ['none'],
    });
  };

  const createPolicy = (event: FormEvent) => {
    event.preventDefault();
    const selectedType = data?.fineTypes.find((item) => item._id === policy.fineTypeId);
    if (!selectedType) return;
    void run('create-policy', 'POST', {
      action: 'createPolicy',
      fineTypeId: selectedType._id,
      trigger: selectedType.category,
      deadline: selectedType.category === 'manual' ? null : policy.deadline,
      effectiveFrom: new Date().toISOString(),
      submissionStage: policy.stage || null,
      gracePeriodDays: 0,
      timeZone: 'Asia/Karachi',
      calculation: {
        method: policy.method,
        fixedAmount: Number(policy.fixedAmount),
        startingAmount: Number(policy.startingAmount),
        dailyAmount: Number(policy.dailyAmount),
        maximumAmount: policy.maximumAmount ? Number(policy.maximumAmount) : null,
      },
      defaultRestrictions: ['none'],
    });
  };

  const createManualFine = async (event: FormEvent) => {
    event.preventDefault();
    const studentIds = manual.studentIds.split(',').map((value) => value.trim()).filter(Boolean);
    const base = {
      fineTypeId: manual.fineTypeId,
      target: { scope: studentIds.length === 1 ? 'student' : 'students', studentIds },
      title: manual.title,
      reason: manual.reason,
      amount: Number(manual.amount),
      dueDate: manual.dueDate,
      restrictions: [manual.restrictions],
      accumulationEnabled: false,
      disputesAllowed: true,
      idempotencyKey: crypto.randomUUID(),
    };
    try {
      const result = await adminAction('POST', { action: 'previewManualFine', ...base });
      const preview = isRecord(result.preview) ? result.preview : {};
      showDialog({
        type: 'confirm',
        title: 'Create manual fines?',
        message: `${Number(preview.affectedStudents || 0)} student(s) will receive fines totaling ${money(preview.totalAmount)}.`,
        onConfirm: () => run('manual-fine', 'POST', { action: 'createManualFine', ...base, confirm: true }),
      });
    } catch (previewError) {
      showDialog({ title: 'Manual fine preview failed', message: previewError instanceof Error ? previewError.message : 'Unable to preview manual fines.' });
    }
  };

  const createRestrictionRule = async (event: FormEvent) => {
    event.preventDefault();
    const base = {
      scope: rule.scope,
      label: rule.label,
      restrictions: [rule.restriction],
      fineTypeId: rule.scope === 'fine-type' ? rule.fineTypeId : null,
      studentId: rule.scope === 'student' ? rule.studentId : null,
      program: rule.scope === 'program-batch' ? rule.program : null,
      batch: rule.scope === 'program-batch' ? rule.batch : null,
      projectId: rule.scope === 'project-team' ? rule.projectId : null,
      fineRecordId: rule.scope === 'fine-record' ? rule.fineRecordId : null,
    };
    try {
      const result = await adminAction('POST', { action: 'previewRestrictionRule', ...base });
      const preview = isRecord(result.preview) ? result.preview : {};
      showDialog({
        type: 'confirm',
        title: 'Apply restriction rule?',
        message: `${Number(preview.affectedStudents || 0)} student(s) across ${Number(preview.affectedFines || 0)} unresolved fine record(s) are currently affected.`,
        onConfirm: () => run('restriction-rule', 'POST', {
          action: 'createRestrictionRule',
          ...base,
          confirm: true,
        }),
      });
    } catch (previewError) {
      showDialog({ title: 'Restriction preview failed', message: previewError instanceof Error ? previewError.message : 'Unable to preview restriction rule.' });
    }
  };

  const recordOffline = async (event: FormEvent) => {
    event.preventDefault();
    const reason = offline.reason.trim();
    if (!reason) return;
    const fineIds = offline.fineIds.split(',').map((value) => value.trim()).filter(Boolean);
    try {
      const result = await adminAction('POST', {
        action: 'previewOfflinePayment',
        studentId: offline.studentId,
        fineIds,
        paidAmount: Number(offline.paidAmount),
      });
      const preview = isRecord(result.preview) ? result.preview : {};
      const student = isRecord(preview.student) ? preview.student : {};
      showDialog({
        type: 'confirm',
        title: `Record offline payment ${offline.reference}?`,
        message: `${String(student.name || 'The student')} has ${fineIds.length} selected fine record(s), with ${money(preview.outstandingAmount)} outstanding. ${money(preview.settledAmount)} will be settled and ${money(preview.unallocatedAmount)} will remain unallocated.`,
        onConfirm: () => run('offline-payment', 'POST', {
          action: 'recordOfflinePayment',
          studentId: offline.studentId,
          fineIds,
          reference: offline.reference,
          paidAmount: Number(offline.paidAmount),
          paymentDate: offline.paymentDate,
          idempotencyKey: crypto.randomUUID(),
          reason,
          confirm: true,
        }),
      });
    } catch (previewError) {
      showDialog({ title: 'Offline payment preview failed', message: previewError instanceof Error ? previewError.message : 'Unable to preview offline payment.' });
    }
  };

  const downloadReport = () => {
    if (!data) return;
    const typeNames = new Map(data.fineTypes.map((item) => [item._id, item.name]));
    const rows = [
      ['Fine Type', 'Status', 'Records', 'Generated Amount', 'Settled Amount'],
      ...data.report.map((row) => [
        typeNames.get(String(row._id.fineTypeId)) || String(row._id.fineTypeId),
        row._id.status,
        String(row.count),
        String(row.amount),
        String(row.settled),
      ]),
    ];
    downloadTextFile(
      rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n'),
      `fine-report-${dateInput()}.csv`,
      'text/csv;charset=utf-8'
    );
  };

  if (loading && !data) {
    return <DashboardPanel><div className="flex min-h-56 items-center justify-center gap-3"><Loader2 className="animate-spin" size={20} /> Loading dynamic fine management...</div></DashboardPanel>;
  }
  if (!data) {
    return <DashboardPanel><SectionHeader title="Dynamic fine management unavailable" description={error || 'No fine data was returned.'} /><Button onClick={() => void load()}><RefreshCcw size={16} /> Retry</Button></DashboardPanel>;
  }

  const overview = data.overview;
  const manualTypes = data.fineTypes.filter((item) => item.category === 'manual');

  return (
    <div className="space-y-6">
      <section>
        <SectionHeader
          title="Dynamic Fine Overview"
          description="New fine records, payment verification, restrictions, and audit history. Legacy account-embedded fines remain available below."
          action={<Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} /> Refresh</Button>}
        />
        <DashboardGrid columns="four">
          <StatCard label="Outstanding" value={money(overview.outstandingAmount)} hint={`${overview.finedStudents} fined students`} icon={<CircleDollarSign size={18} />} />
          <StatCard label="Collected" value={money(overview.collectedAmount)} hint={`${money(overview.waivedAmount)} waived`} icon={<BadgeDollarSign size={18} />} />
          <StatCard label="Restricted" value={overview.restrictedStudents} hint={`${overview.loginBlocked} login restrictions`} icon={<Ban size={18} />} />
          <StatCard label="Verification Queue" value={overview.pendingPaymentVerifications} hint={`${overview.activePolicies} active policies`} icon={<ShieldCheck size={18} />} />
        </DashboardGrid>
      </section>

      <DashboardPanel>
        <SectionHeader title="Payment Verification" description="Preview the exact clearance impact before accepting payment." />
        {data.payments.filter((item) => item.status === 'submitted' || item.status === 'under-verification').length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No payment submissions require verification.</p>
        ) : (
          <div className="space-y-3">
            {data.payments.filter((item) => item.status === 'submitted' || item.status === 'under-verification').map((paymentItem) => (
              <article key={paymentItem._id} className="grid gap-4 rounded-2xl border border-[var(--color-border)] p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black">{paymentItem.studentId.name} ({paymentItem.studentId.rollNo})</p>
                    <Badge variant="warning">{paymentItem.status.replaceAll('-', ' ')}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{paymentItem.reference} · {money(paymentItem.paidAmount)} · {new Date(paymentItem.paymentDate).toLocaleDateString()}</p>
                  {paymentItem.proofKey && <a className="mt-2 inline-flex items-center gap-2 text-sm font-bold underline" href={`/api/read-pdf?url=${encodeURIComponent(paymentItem.proofKey)}`} target="_blank" rel="noreferrer"><FileCheck2 size={16} /> View proof</a>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="success" disabled={Boolean(busy)} onClick={() => void verifyPayment(paymentItem)}>Verify & Clear</Button>
                  <Button variant="danger" disabled={Boolean(busy)} onClick={() => rejectPayment(paymentItem)}>Reject</Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </DashboardPanel>

      {data.payments.some((item) => item.status === 'accepted' || item.status === 'rejected') && (
        <DashboardPanel>
          <SectionHeader title="Payment Verification History" description="Accepted and rejected payment submissions remain available for audit." />
          <div className="space-y-2">
            {data.payments.filter((item) => item.status === 'accepted' || item.status === 'rejected').map((item) => (
              <div key={item._id} className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-black">{item.studentId.name} · {item.reference}</p><p className="text-sm text-[var(--color-text-muted)]">{money(item.paidAmount)}{item.rejectionReason ? ` · ${item.rejectionReason}` : ''}</p></div>
                <Badge variant={item.status === 'accepted' ? 'success' : 'danger'}>{item.status}</Badge>
              </div>
            ))}
          </div>
        </DashboardPanel>
      )}

      <DashboardPanel>
        <SectionHeader
          title="Record Offline Payment"
          description="Record an administrator-confirmed bank or office payment, allocate it to explicit fine records, and retain the same audit trail as an online submission."
        />
        <form className="grid gap-3 md:grid-cols-2" onSubmit={recordOffline}>
          <StyledInput placeholder="Student database ID" value={offline.studentId} onChange={(event) => setOffline((value) => ({ ...value, studentId: event.target.value }))} required />
          <StyledInput placeholder="Fine record IDs, comma separated" value={offline.fineIds} onChange={(event) => setOffline((value) => ({ ...value, fineIds: event.target.value }))} required />
          <StyledInput placeholder="Payment reference" value={offline.reference} onChange={(event) => setOffline((value) => ({ ...value, reference: event.target.value }))} required />
          <StyledInput type="number" min="1" placeholder="Paid amount" value={offline.paidAmount} onChange={(event) => setOffline((value) => ({ ...value, paidAmount: event.target.value }))} required />
          <StyledInput type="date" value={offline.paymentDate} onChange={(event) => setOffline((value) => ({ ...value, paymentDate: event.target.value }))} required />
          <StyledInput placeholder="Administrative reason" value={offline.reason} onChange={(event) => setOffline((value) => ({ ...value, reason: event.target.value }))} required />
          <Button type="submit" disabled={Boolean(busy)}>Confirm & Record Payment</Button>
        </form>
      </DashboardPanel>

      <DashboardPanel>
        <SectionHeader title="Fined Students" description={`${data.pagination.total} matching fine record(s), page ${data.pagination.page} of ${data.pagination.totalPages}.`} />
        <form className="mb-5 grid gap-3 md:grid-cols-[1fr_14rem_auto_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); setActiveSearch(search.trim()); setFilters(filterInputs); }}>
          <StyledInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student name or exact roll number" />
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="all">All statuses</option>
            {['scheduled', 'accruing', 'paused', 'pending-payment', 'payment-submitted', 'under-verification', 'paid', 'waived', 'cancelled', 'disputed'].map((value) => <option key={value} value={value}>{value.replaceAll('-', ' ')}</option>)}
          </Select>
          <Button type="submit"><Search size={16} /> Filter</Button>
          <Button type="button" variant="outline" onClick={() => { setSearch(''); setActiveSearch(''); setStatus('all'); setFilterInputs(emptyFilters()); setFilters(emptyFilters()); setPage(1); }}>Clear</Button>
          <details className="md:col-span-4 rounded-xl border border-[var(--color-border)] p-3">
            <summary className="cursor-pointer text-sm font-black">Advanced filters</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StyledInput placeholder="Program" value={filterInputs.program} onChange={(event) => setFilterInputs((value) => ({ ...value, program: event.target.value }))} />
              <StyledInput placeholder="Batch" value={filterInputs.batch} onChange={(event) => setFilterInputs((value) => ({ ...value, batch: event.target.value }))} />
              <Select value={filterInputs.fineTypeId} onChange={(event) => setFilterInputs((value) => ({ ...value, fineTypeId: event.target.value }))}><option value="">All fine types</option>{data.fineTypes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</Select>
              <Select value={filterInputs.restriction} onChange={(event) => setFilterInputs((value) => ({ ...value, restriction: event.target.value }))}><option value="">All restrictions</option><option value="pdf-upload-student">Student upload blocked</option><option value="pdf-upload-team">Team upload blocked</option><option value="login-payment-only">Payment-only access</option><option value="login-complete">Complete login lock</option><option value="team-membership">Team membership blocked</option><option value="supervisor-selection">Supervisor selection blocked</option></Select>
              <StyledInput type="date" aria-label="Created from" value={filterInputs.dateFrom} onChange={(event) => setFilterInputs((value) => ({ ...value, dateFrom: event.target.value }))} />
              <StyledInput type="date" aria-label="Created through" value={filterInputs.dateTo} onChange={(event) => setFilterInputs((value) => ({ ...value, dateTo: event.target.value }))} />
              <StyledInput placeholder="Project database ID" value={filterInputs.projectId} onChange={(event) => setFilterInputs((value) => ({ ...value, projectId: event.target.value }))} />
              <StyledInput placeholder="Supervisor database ID" value={filterInputs.supervisorId} onChange={(event) => setFilterInputs((value) => ({ ...value, supervisorId: event.target.value }))} />
            </div>
          </details>
        </form>
        {data.fines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-text-muted)]">No fine records match these filters.</p>
        ) : (
          <div className="space-y-3">
            {data.fines.map((fine) => (
              <article key={fine._id} className="grid gap-4 rounded-2xl border border-[var(--color-border)] p-4 xl:grid-cols-[1fr_auto] xl:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><p className="font-black">{fine.studentId.name} ({fine.studentId.rollNo})</p><Badge variant={['paid', 'waived'].includes(fine.status) ? 'success' : 'warning'}>{fine.status.replaceAll('-', ' ')}</Badge></div>
                  <p className="mt-1 text-sm font-semibold">{fine.title} · {money(fine.currentAmount)} · settled {money(fine.settledAmount)}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">{fine.fineTypeId?.name || 'Fine'} · policy v{fine.policyVersion} · {fine.reason}</p>
                  {(fine.restrictionOverride?.length || fine.policyRestrictions?.length) ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">Restriction sources: {fine.restrictionOverride?.length ? `fine-record override (${fine.restrictionOverride.join(', ')})` : `policy v${fine.policyVersion} (${fine.policyRestrictions?.join(', ')})`}</p> : null}
                </div>
                {!['paid', 'waived', 'cancelled'].includes(fine.status) ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => correct(fine)}>Correct</Button><Button variant="outline" onClick={() => adjust(fine, 'discount')}>Discount</Button><Button variant="outline" onClick={() => adjust(fine, 'charge')}>Charge</Button><Button variant="danger" onClick={() => waive(fine)}>Waive</Button></div> : fine.restorationSnapshots?.length ? <Button variant="outline" onClick={() => void restore(fine)}>Restore Relationships</Button> : null}
              </article>
            ))}
          </div>
        )}
        <div className="mt-5 flex justify-between gap-3"><Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(value - 1, 1))}>Previous</Button><Button variant="outline" disabled={page >= data.pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
      </DashboardPanel>

      <DashboardPanel>
        <SectionHeader title="Fine Control" description="Restriction rules are centrally resolved, and broad changes require an impact preview." />
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void createRestrictionRule(event)}>
          <Select value={rule.scope} onChange={(event) => setRule((value) => ({ ...value, scope: event.target.value }))}>
            <option value="global">Global default</option>
            <option value="fine-type">Fine type</option>
            <option value="program-batch">Program and batch</option>
            <option value="project-team">Project team</option>
            <option value="student">Individual student</option>
            <option value="fine-record">Individual fine record</option>
          </Select>
          <StyledInput placeholder="Rule label and administrative reason" value={rule.label} onChange={(event) => setRule((value) => ({ ...value, label: event.target.value }))} required />
          {rule.scope === 'fine-type' && <Select value={rule.fineTypeId} onChange={(event) => setRule((value) => ({ ...value, fineTypeId: event.target.value }))} required><option value="">Select fine type</option>{data.fineTypes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</Select>}
          {rule.scope === 'program-batch' && <><StyledInput placeholder="Program (optional)" value={rule.program} onChange={(event) => setRule((value) => ({ ...value, program: event.target.value }))} /><StyledInput placeholder="Batch (optional)" value={rule.batch} onChange={(event) => setRule((value) => ({ ...value, batch: event.target.value }))} /></>}
          {rule.scope === 'project-team' && <StyledInput placeholder="Project database ID" value={rule.projectId} onChange={(event) => setRule((value) => ({ ...value, projectId: event.target.value }))} required />}
          {rule.scope === 'student' && <StyledInput placeholder="Student database ID" value={rule.studentId} onChange={(event) => setRule((value) => ({ ...value, studentId: event.target.value }))} required />}
          {rule.scope === 'fine-record' && <StyledInput placeholder="Fine record database ID" value={rule.fineRecordId} onChange={(event) => setRule((value) => ({ ...value, fineRecordId: event.target.value }))} required />}
          <Select value={rule.restriction} onChange={(event) => setRule((value) => ({ ...value, restriction: event.target.value }))}><option value="none">No operational restriction</option><option value="pdf-upload-student">Block student PDF upload</option><option value="pdf-upload-team">Block team PDF upload</option><option value="login-payment-only">Payment-only access</option><option value="login-complete">Complete login lock</option><option value="team-membership">Block team membership</option><option value="supervisor-selection">Block supervisor selection</option></Select>
          <Button type="submit" disabled={Boolean(busy)}>Preview & Apply Rule</Button>
        </form>
        {data.restrictionRules.length > 0 && <div className="mt-5 space-y-2"><p className="text-sm font-black">Active restriction sources</p>{data.restrictionRules.map((item) => <article key={item._id} className="flex flex-col gap-1 rounded-xl border border-[var(--color-border)] p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{item.label}</p><p className="text-xs text-[var(--color-text-muted)]">{item.scope.replaceAll('-', ' ')} · {item.restrictions.join(', ') || 'none'}</p></div><Badge>{item.scope}</Badge></article>)}</div>}
      </DashboardPanel>

      <DashboardPanel>
        <SectionHeader title="Fine Types and Policies" description="Versioned policies preserve historical fine calculations." action={<Button onClick={() => void run('initialize', 'POST', { action: 'initializeFineTypes' })}>Initialize Defaults</Button>} />
        <div className="space-y-3">
          {data.policies.map((item) => (
            <article key={item._id} className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] p-4 lg:flex-row lg:items-center lg:justify-between">
              <div><p className="font-black">{data.fineTypes.find((type) => type._id === String(item.fineTypeId))?.name || item.trigger} · v{item.version}</p><p className="mt-1 text-sm text-[var(--color-text-muted)]">{item.submissionStage || item.trigger} · {item.deadline ? new Date(item.deadline).toLocaleDateString() : 'No automatic deadline'}</p></div>
              <div className="flex flex-wrap gap-2"><Badge variant={item.status === 'active' ? 'success' : 'warning'}>{item.status}</Badge>{item.status === 'paused' ? <Button onClick={() => changePolicyStatus(item, 'active')}><Play size={16} /> Resume</Button> : <Button variant="outline" onClick={() => changePolicyStatus(item, 'paused')}><Pause size={16} /> Pause</Button>}{item.trigger !== 'manual' && <Button variant="outline" onClick={() => changeDeadline(item)}>Change Deadline</Button>}</div>
            </article>
          ))}
        </div>

        <details className="mt-5 rounded-xl border border-[var(--color-border)] p-4">
          <summary className="cursor-pointer font-black">Create fine type</summary>
          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={createType}><StyledInput placeholder="Code" value={newType.code} onChange={(event) => setNewType((value) => ({ ...value, code: event.target.value }))} required /><StyledInput placeholder="Name" value={newType.name} onChange={(event) => setNewType((value) => ({ ...value, name: event.target.value }))} required /><Select value={newType.category} onChange={(event) => setNewType((value) => ({ ...value, category: event.target.value }))}><option value="manual">Manual</option><option value="late-registration">Late registration</option><option value="late-submission">Late submission</option></Select><StyledInput placeholder="Description" value={newType.description} onChange={(event) => setNewType((value) => ({ ...value, description: event.target.value }))} /><Button type="submit" disabled={Boolean(busy)}>Create Type</Button></form>
        </details>

        <details className="mt-3 rounded-xl border border-[var(--color-border)] p-4">
          <summary className="cursor-pointer font-black">Create policy version</summary>
          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={createPolicy}><Select value={policy.fineTypeId} onChange={(event) => setPolicy((value) => ({ ...value, fineTypeId: event.target.value }))} required><option value="">Select fine type</option>{data.fineTypes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</Select><Select value={policy.method} onChange={(event) => setPolicy((value) => ({ ...value, method: event.target.value }))}><option value="fixed">Fixed</option><option value="daily">Per late day</option><option value="starting-plus-daily">Starting plus daily</option></Select><StyledInput type="date" value={policy.deadline} onChange={(event) => setPolicy((value) => ({ ...value, deadline: event.target.value }))} /><StyledInput placeholder="Submission stage (optional)" value={policy.stage} onChange={(event) => setPolicy((value) => ({ ...value, stage: event.target.value }))} /><StyledInput type="number" min="0" placeholder="Fixed amount" value={policy.fixedAmount} onChange={(event) => setPolicy((value) => ({ ...value, fixedAmount: event.target.value }))} /><StyledInput type="number" min="0" placeholder="Starting amount" value={policy.startingAmount} onChange={(event) => setPolicy((value) => ({ ...value, startingAmount: event.target.value }))} /><StyledInput type="number" min="0" placeholder="Daily amount" value={policy.dailyAmount} onChange={(event) => setPolicy((value) => ({ ...value, dailyAmount: event.target.value }))} /><StyledInput type="number" min="0" placeholder="Maximum amount (optional)" value={policy.maximumAmount} onChange={(event) => setPolicy((value) => ({ ...value, maximumAmount: event.target.value }))} /><Button type="submit" disabled={Boolean(busy)}>Create Policy</Button></form>
        </details>
      </DashboardPanel>

      <DashboardPanel>
        <SectionHeader title="Manual Fine Assignment" description="Preview every bulk assignment before creating duplicate-safe fine records." />
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void createManualFine(event)}><Select value={manual.fineTypeId} onChange={(event) => setManual((value) => ({ ...value, fineTypeId: event.target.value }))} required><option value="">Select manual fine type</option>{manualTypes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</Select><StyledInput placeholder="Student database IDs, comma separated" value={manual.studentIds} onChange={(event) => setManual((value) => ({ ...value, studentIds: event.target.value }))} required /><StyledInput placeholder="Fine title" value={manual.title} onChange={(event) => setManual((value) => ({ ...value, title: event.target.value }))} required /><StyledInput type="number" min="1" placeholder="Amount" value={manual.amount} onChange={(event) => setManual((value) => ({ ...value, amount: event.target.value }))} required /><StyledInput type="date" value={manual.dueDate} onChange={(event) => setManual((value) => ({ ...value, dueDate: event.target.value }))} required /><Select value={manual.restrictions} onChange={(event) => setManual((value) => ({ ...value, restrictions: event.target.value }))}><option value="none">No operational restriction</option><option value="pdf-upload-student">Block student PDF upload</option><option value="pdf-upload-team">Block team PDF upload</option><option value="login-payment-only">Payment-only access</option><option value="login-complete">Complete login lock</option><option value="team-membership">Block team membership</option><option value="supervisor-selection">Block supervisor selection</option></Select><TextArea className="md:col-span-2" placeholder="Reason" value={manual.reason} onChange={(event) => setManual((value) => ({ ...value, reason: event.target.value }))} required rows={3} /><Button type="submit" disabled={Boolean(busy)}>Preview & Create</Button></form>
      </DashboardPanel>

      <DashboardPanel>
        <SectionHeader title="Reporting and Audit" description={`${data.pagination.auditTotal} auditable action(s). Reports use the active filters and bounded server queries.`} action={<Button variant="outline" onClick={downloadReport}><Download size={16} /> Download CSV</Button>} />
        <div className="space-y-3">
          {data.audits.map((item) => <article key={item._id} className="rounded-xl border border-[var(--color-border)] p-4"><div className="flex flex-wrap items-center gap-2"><Badge>{item.entityType}</Badge><p className="font-black">{item.action.replaceAll('-', ' ')}</p><span className="text-xs text-[var(--color-text-muted)]">{new Date(item.createdAt).toLocaleString()}</span></div><p className="mt-2 text-sm text-[var(--color-text-muted)]">{item.details}</p></article>)}
        </div>
      </DashboardPanel>

      <p className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]"><AlertTriangle size={14} /> Dynamic fine actions never delete project documents or payment proof objects. Relationship restoration is always a separate previewed action.</p>
    </div>
  );
}
