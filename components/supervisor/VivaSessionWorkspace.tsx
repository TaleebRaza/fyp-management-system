'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Play, RefreshCw } from 'lucide-react';

import type { VivaPersonDto, VivaSessionWorkspaceDto } from '../../lib/vivaSessionDashboard';
import { Badge, Button, DashboardPanel, SectionHeader } from '../ui';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readPerson(value: unknown): { id: string; name: string; rollNo: string } | null {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.rollNo === 'string'
    ? { id: value.id, name: value.name, rollNo: value.rollNo }
    : null;
}

function readPeople(value: unknown): VivaPersonDto[] | null {
  if (!Array.isArray(value)) return null;

  const people: VivaPersonDto[] = [];
  for (const item of value) {
    const person = readPerson(item);
    if (!person) return null;
    people.push(person);
  }
  return people;
}

function readSession(value: unknown): VivaSessionWorkspaceDto | null {
  if (!isRecord(value) || !isRecord(value.round) || !isRecord(value.project) || !isRecord(value.panel)) {
    return null;
  }
  const projectMembers = readPeople(value.project.members);
  const panelMembers = readPeople(value.panel.members);
  const panelAdmin = readPerson(value.panel.admin);
  const supervisor = value.project.supervisor === null ? null : readPerson(value.project.supervisor);
  const domains = Array.isArray(value.project.domains)
    ? value.project.domains.filter((domain): domain is string => typeof domain === 'string')
    : null;
  if (
    typeof value.id !== 'string'
    || (value.phase !== 'scheduled' && value.phase !== 'running')
    || typeof value.scheduledAt !== 'string'
    || (value.startedAt !== null && typeof value.startedAt !== 'string')
    || typeof value.vivaEndsAt !== 'string'
    || typeof value.locationLabel !== 'string'
    || typeof value.round.name !== 'string'
    || typeof value.round.vivaDurationMinutes !== 'number'
    || typeof value.project.id !== 'string'
    || typeof value.project.title !== 'string'
    || typeof value.project.description !== 'string'
    || typeof value.project.tools !== 'string'
    || !domains
    || !projectMembers
    || !panelMembers
    || !panelAdmin
    || typeof value.panel.id !== 'string'
    || supervisor === null && value.project.supervisor !== null
  ) {
    return null;
  }

  return {
    id: value.id,
    phase: value.phase,
    scheduledAt: value.scheduledAt,
    startedAt: value.startedAt,
    vivaEndsAt: value.vivaEndsAt,
    locationLabel: value.locationLabel,
    round: { name: value.round.name, vivaDurationMinutes: value.round.vivaDurationMinutes },
    project: {
      id: value.project.id,
      title: value.project.title,
      description: value.project.description,
      domains,
      tools: value.project.tools,
      members: projectMembers,
      supervisor,
    },
    panel: {
      id: value.panel.id,
      admin: panelAdmin,
      members: panelMembers,
    },
  };
}

function readSessions(value: unknown): VivaSessionWorkspaceDto[] | null {
  if (!isRecord(value) || !Array.isArray(value.sessions)) return null;

  const sessions: VivaSessionWorkspaceDto[] = [];
  for (const sessionValue of value.sessions) {
    const session = readSession(sessionValue);
    if (!session) return null;
    sessions.push(session);
  }
  return sessions;
}

function readError(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === 'string' && value.error.trim()
    ? value.error
    : fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-PK', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Karachi',
      }).format(date)
    : 'Unavailable';
}

export default function VivaSessionWorkspace() {
  const [sessions, setSessions] = useState<VivaSessionWorkspaceDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [startingSessionId, setStartingSessionId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/dashboard/supervisor/viva', { cache: 'no-store' });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to load Viva sessions.'));

      const nextSessions = readSessions(body);
      if (!nextSessions) throw new Error('Viva session response was invalid.');
      setSessions(nextSessions);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load Viva sessions.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSessions();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSessions]);

  const startSession = async (sessionId: string) => {
    if (startingSessionId) return;

    setStartingSessionId(sessionId);
    setError('');
    try {
      const response = await fetch('/api/dashboard/supervisor/viva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to start the Viva session.'));
      if (!isRecord(body)) throw new Error('Viva session response was invalid.');

      const startedSession = readSession(body.session);
      if (!startedSession) throw new Error('Viva session response was invalid.');
      setSessions((current) => current.map((session) => session.id === startedSession.id ? startedSession : session));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to start the Viva session.');
      await loadSessions();
    } finally {
      setStartingSessionId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">
        <Loader2 className="mr-2 animate-spin" size={18} />Loading Viva sessions...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardPanel>
        <SectionHeader
          title="Viva Sessions"
          description="Only your assigned panel-admin sessions appear here. Confirm the team and panel before starting."
          action={<Button variant="outline" onClick={() => void loadSessions()} disabled={Boolean(startingSessionId)}><RefreshCw size={16} />Reload</Button>}
        />
        {error && <p role="alert" className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-danger)]">{error}</p>}
        {!error && sessions.length === 0 && (
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">No Viva sessions are assigned to you as panel admin.</p>
        )}
      </DashboardPanel>

      {sessions.map((session) => {
        const isStarting = startingSessionId === session.id;
        return (
          <DashboardPanel key={session.id}>
            <SectionHeader
              title={session.project.title || 'Untitled project'}
              description={`${session.round.name} · ${session.locationLabel || 'Location not specified'}`}
              action={<Badge variant={session.phase === 'running' ? 'warning' : 'success'}>{session.phase === 'running' ? 'Running' : 'Scheduled'}</Badge>}
            />
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-bold text-[var(--color-text-muted)]">Scheduled</dt>
                <dd className="mt-1 text-[var(--color-text)]">{formatDateTime(session.scheduledAt)}</dd>
              </div>
              <div>
                <dt className="font-bold text-[var(--color-text-muted)]">{session.phase === 'running' ? 'Ends' : 'Planned end'}</dt>
                <dd className="mt-1 text-[var(--color-text)]">{formatDateTime(session.vivaEndsAt)}</dd>
              </div>
              <div>
                <dt className="font-bold text-[var(--color-text-muted)]">Team</dt>
                <dd className="mt-1 text-[var(--color-text)]">{session.project.members.map((member) => member.name).join(', ')}</dd>
              </div>
              <div>
                <dt className="font-bold text-[var(--color-text-muted)]">Panel</dt>
                <dd className="mt-1 text-[var(--color-text)]">{session.panel.members.map((member) => member.name).join(', ')}</dd>
              </div>
            </dl>
            {session.phase === 'scheduled' && (
              <div className="mt-6 flex justify-end">
                <Button onClick={() => void startSession(session.id)} disabled={Boolean(startingSessionId)}>
                  {isStarting ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
                  {isStarting ? 'Starting...' : 'Start Viva'}
                </Button>
              </div>
            )}
          </DashboardPanel>
        );
      })}
    </div>
  );
}
