'use client';

import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { dismissSupervisorNotification } from './api/supervisorDashboardApi';
import type { SupervisorJoinNotification } from './supervisorDashboardTypes';

export default function SupervisorJoinNotifications({ notifications }: { notifications: SupervisorJoinNotification[] }) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = notifications.filter((notification) => !dismissedIds.includes(notification._id));
  const notification = pending[0];

  async function dismiss() {
    if (!notification || busy) return;
    setBusy(true);
    setError('');
    try {
      await dismissSupervisorNotification(notification.projectId, notification._id);
      setDismissedIds((ids) => [...ids, notification._id]);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not dismiss the notification. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div aria-live="polite" aria-atomic="true" className="fixed bottom-24 right-4 z-40 w-[calc(100%-2rem)] max-w-sm lg:bottom-6 lg:right-6">
      {notification && <section aria-label="New student notification" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-[var(--color-text)] shadow-[var(--shadow-dialog)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Bell size={17} />New student joined</h2>
          <button type="button" aria-label="Dismiss notification" disabled={busy} onClick={() => void dismiss()} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-[var(--color-surface-muted)] disabled:opacity-50"><X size={17} /></button>
        </div>
        <p className="mt-2 break-words text-sm leading-6">{notification.message}</p>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">{new Date(notification.createdAt).toLocaleString()}{pending.length > 1 && ` · ${pending.length - 1} more pending`}</p>
        {error && <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
      </section>}
    </div>
  );
}
