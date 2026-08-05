'use client';

import { useEffect, useState } from 'react';
import {
  CircleCheck,
  ClipboardCheck,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Settings2,
  UserRoundCog,
} from 'lucide-react';

import {
  type PortalActivityAction,
  type PortalActivityEntry,
} from '../../lib/portalActivityLog';
import { Badge, Button, DashboardPanel, EmptyState, SectionHeader } from '../ui';

type ActivityLogResponse = {
  entries?: PortalActivityLogEntry[];
  pagination?: {
    page?: number;
    totalPages?: number;
  };
  error?: string;
};

type PortalActivityLogEntry = Omit<PortalActivityEntry, 'occurredAt'> & {
  occurredAt: string;
};

type PaginationState = {
  page: number;
  totalPages: number;
};

const ACTION_DETAILS: Record<PortalActivityAction, {
  label: string;
  icon: typeof CircleCheck;
  variant: 'default' | 'accent' | 'success' | 'warning' | 'muted';
}> = {
  login: { label: 'Signed in', icon: LogIn, variant: 'success' },
  logout: { label: 'Signed out', icon: LogOut, variant: 'muted' },
  'password-changed': { label: 'Changed their password', icon: KeyRound, variant: 'warning' },
  'student-registered': { label: 'Registered a student account', icon: UserRoundCog, variant: 'success' },
  'project-submitted': { label: 'Submitted a project', icon: ClipboardCheck, variant: 'accent' },
  'project-approved': { label: 'Approved a project', icon: CircleCheck, variant: 'success' },
  'project-rejected': { label: 'Rejected a project', icon: CircleCheck, variant: 'warning' },
  'project-changes-requested': { label: 'Requested project changes', icon: ClipboardCheck, variant: 'warning' },
  'student-name-updated': { label: 'Updated their name', icon: UserRoundCog, variant: 'default' },
  'student-academic-details-updated': { label: 'Updated academic details', icon: UserRoundCog, variant: 'default' },
  'student-supervisor-updated': { label: 'Changed supervisor', icon: UserRoundCog, variant: 'default' },
  'student-team-joined': { label: 'Joined a project team', icon: UserRoundCog, variant: 'default' },
  'student-team-left': { label: 'Left a project team', icon: UserRoundCog, variant: 'default' },
  'supervisor-student-migrated': { label: 'Migrated a student', icon: UserRoundCog, variant: 'default' },
  'supervisor-team-removed': { label: 'Removed a project team', icon: UserRoundCog, variant: 'default' },
  'supervisor-team-expanded': { label: 'Expanded a project team', icon: UserRoundCog, variant: 'default' },
  'supervisor-broadcast-published': { label: 'Published a broadcast', icon: Settings2, variant: 'accent' },
  'supervisor-broadcast-cleared': { label: 'Cleared a broadcast', icon: Settings2, variant: 'default' },
  'admin-supervisor-added': { label: 'Added a supervisor', icon: UserRoundCog, variant: 'success' },
  'admin-supervisor-deleted': { label: 'Deleted a supervisor', icon: UserRoundCog, variant: 'warning' },
  'admin-supervisor-updated': { label: 'Updated a supervisor', icon: UserRoundCog, variant: 'default' },
  'admin-student-updated': { label: 'Updated a student account', icon: UserRoundCog, variant: 'default' },
  'admin-registration-updated': { label: 'Updated registration settings', icon: Settings2, variant: 'default' },
  'admin-fines-updated': { label: 'Updated fine settings', icon: Settings2, variant: 'default' },
  'admin-headline-updated': { label: 'Updated the headline', icon: Settings2, variant: 'default' },
  'admin-project-submissions-updated': { label: 'Updated project submissions', icon: Settings2, variant: 'default' },
};

function formatRole(role: PortalActivityLogEntry['actorRole']) {
  return role === 'supervisor' ? 'Supervisor' : role[0].toUpperCase() + role.slice(1);
}

function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function AdminActivityLogsPanel() {
  const [entries, setEntries] = useState<PortalActivityLogEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadLogs = async (page: number, showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setLoadError('');

    try {
      const response = await fetch(`/api/admin/activity-logs?page=${page}`, { cache: 'no-store' });
      const data: ActivityLogResponse = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load activity logs.');

      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setPagination({
        page: data.pagination?.page || 1,
        totalPages: data.pagination?.totalPages || 0,
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load activity logs.');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLogs(1);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">
        <Loader2 className="mr-2 animate-spin" size={18} />
        Loading activity logs...
      </div>
    );
  }

  return (
    <DashboardPanel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          title="Portal Activity"
          description="Recent server activity, shown in your local time."
        />
        <Button variant="outline" onClick={() => void loadLogs(pagination.page)}>
          <RefreshCw size={16} />
          Refresh
        </Button>
      </div>

      {loadError ? (
        <EmptyState title="Activity logs unavailable" description={loadError} />
      ) : entries.length === 0 ? (
        <EmptyState title="No activity yet" description="New server activity will appear here." />
      ) : (
        <div className="mt-5 divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
          {entries.map((entry, index) => {
            const detail = ACTION_DETAILS[entry.action];
            const Icon = detail.icon;
            const showActorIdentity = entry.actorRole !== 'admin' && Boolean(entry.actorName);
            const actorIdentifier = entry.actorRollNo || entry.actorId;
            return (
              <div
                key={`${entry.occurredAt}-${index}`}
                className="flex items-center gap-3 px-4 py-3 sm:px-5"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--color-text)]">
                    {showActorIdentity
                      ? entry.actorName
                      : `${formatRole(entry.actorRole)} ${detail.label.toLowerCase()}`}
                  </p>
                  {showActorIdentity && actorIdentifier && (
                    <p className="mt-0.5 text-xs font-semibold text-[var(--color-text-muted)]">
                      {actorIdentifier}
                    </p>
                  )}
                  {showActorIdentity && (
                    <p className="mt-0.5 text-xs font-medium text-[var(--color-text-muted)]">
                      {formatRole(entry.actorRole)} {detail.label.toLowerCase()}
                    </p>
                  )}
                  <time className="mt-0.5 block text-xs font-medium text-[var(--color-text-muted)]" dateTime={new Date(entry.occurredAt).toISOString()}>
                    {formatTime(entry.occurredAt)}
                  </time>
                </div>
                <Badge variant={detail.variant}>{formatRole(entry.actorRole)}</Badge>
              </div>
            );
          })}
        </div>
      )}

      {pagination.totalPages > 1 && !loadError && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            disabled={pagination.page <= 1}
            onClick={() => void loadLogs(pagination.page - 1)}
          >
            Previous
          </Button>
          <p className="text-sm font-semibold text-[var(--color-text-muted)]">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <Button
            variant="outline"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => void loadLogs(pagination.page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </DashboardPanel>
  );
}
