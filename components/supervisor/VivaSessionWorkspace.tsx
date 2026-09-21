'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Play, RefreshCw, Save, XCircle } from 'lucide-react';

import type { VivaPersonDto, VivaSessionWorkspaceDto } from '../../lib/vivaSessionDashboard';
import { Badge, Button, DashboardPanel, Dialog, SectionHeader, Select } from '../ui';

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

function readGrade(value: unknown): { grade: string; percentage: number } | null {
  return isRecord(value)
    && typeof value.grade === 'string'
    && typeof value.percentage === 'number'
    && Number.isFinite(value.percentage)
    ? { grade: value.grade, percentage: value.percentage }
    : null;
}

function readGradeScale(value: unknown): { grade: string; percentage: number }[] | null {
  if (!Array.isArray(value)) return null;

  const grades: { grade: string; percentage: number }[] = [];
  for (const item of value) {
    const grade = readGrade(item);
    if (!grade) return null;
    grades.push(grade);
  }
  return grades;
}

function readSession(value: unknown): VivaSessionWorkspaceDto | null {
  if (!isRecord(value) || !isRecord(value.round) || !isRecord(value.project) || !isRecord(value.panel)) {
    return null;
  }
  const projectMembers = readPeople(value.project.members);
  const panelMembers = readPeople(value.panel.members);
  const panelAdmin = readPerson(value.panel.admin);
  const gradeScale = readGradeScale(value.gradeScale);
  const result = value.result === null ? null : readGrade(value.result);
  const supervisor = value.project.supervisor === null ? null : readPerson(value.project.supervisor);
  const domains = Array.isArray(value.project.domains)
    ? value.project.domains.filter((domain): domain is string => typeof domain === 'string')
    : null;
  if (
    typeof value.id !== 'string'
    || (value.phase !== 'scheduled' && value.phase !== 'running' && value.phase !== 'completed')
    || typeof value.canManage !== 'boolean'
    || typeof value.version !== 'number'
    || !Number.isSafeInteger(value.version)
    || value.version < 0
    || !gradeScale
    || result === null && value.result !== null
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
    canManage: value.canManage,
    version: value.version,
    gradeScale,
    result,
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

function orderSessions(sessions: VivaSessionWorkspaceDto[]): VivaSessionWorkspaceDto[] {
  return [...sessions].sort(
    (left, right) => Number(left.phase === 'completed') - Number(right.phase === 'completed'),
  );
}

function readError(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === 'string' && value.error.trim()
    ? value.error
    : fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
    : 'Unavailable';
}

export default function VivaSessionWorkspace() {
  const [sessions, setSessions] = useState<VivaSessionWorkspaceDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<{ sessionId: string; type: 'start' | 'save' | 'complete' | 'requeue' } | null>(null);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [requeueSessionId, setRequeueSessionId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/dashboard/supervisor/viva', { cache: 'no-store' });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to load Viva sessions.'));

      const nextSessions = readSessions(body);
      if (!nextSessions) throw new Error('Viva session response was invalid.');
      setSessions(orderSessions(nextSessions));
      setGradeDrafts(Object.fromEntries(nextSessions.map((session) => [session.id, session.result?.grade || ''])));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load Viva sessions.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadSessions());
  }, [loadSessions]);

  const startSession = async (sessionId: string) => {
    if (pendingAction) return;

    setPendingAction({ sessionId, type: 'start' });
    setError('');
    try {
      const response = await fetch('/api/dashboard/supervisor/viva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', sessionId }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to start the Viva session.'));
      if (!isRecord(body)) throw new Error('Viva session response was invalid.');

      const startedSession = readSession(body.session);
      if (!startedSession) throw new Error('Viva session response was invalid.');
      setSessions((current) => current.map((session) => session.id === startedSession.id ? startedSession : session));
      setGradeDrafts((current) => ({ ...current, [startedSession.id]: startedSession.result?.grade || '' }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to start the Viva session.');
      await loadSessions();
    } finally {
      setPendingAction(null);
    }
  };

  const saveGrade = async (session: VivaSessionWorkspaceDto) => {
    if (pendingAction) return;

    const grade = gradeDrafts[session.id] || '';
    if (!grade) {
      setError('Select a grade before saving.');
      return;
    }

    setPendingAction({ sessionId: session.id, type: 'save' });
    setError('');
    try {
      const response = await fetch('/api/dashboard/supervisor/viva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-grade', sessionId: session.id, version: session.version, grade }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to save the Viva grade.'));
      if (!isRecord(body)) throw new Error('Viva session response was invalid.');

      const savedSession = readSession(body.session);
      if (!savedSession) throw new Error('Viva session response was invalid.');
      setSessions((current) => current.map((currentSession) => currentSession.id === savedSession.id ? savedSession : currentSession));
      setGradeDrafts((current) => ({ ...current, [savedSession.id]: savedSession.result?.grade || '' }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save the Viva grade.');
      await loadSessions();
    } finally {
      setPendingAction(null);
    }
  };

  const completeSession = async (session: VivaSessionWorkspaceDto) => {
    if (pendingAction || !session.result) return;

    setPendingAction({ sessionId: session.id, type: 'complete' });
    setError('');
    try {
      const response = await fetch('/api/dashboard/supervisor/viva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', sessionId: session.id, version: session.version }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to complete the Viva session.'));
      if (!isRecord(body) || body.completed !== true) throw new Error('Viva completion response was invalid.');
      const completedSession = readSession(body.session);
      if (!completedSession || completedSession.phase !== 'completed') {
        throw new Error('Viva completion response was invalid.');
      }
      setSessions((current) => orderSessions(current.map((currentSession) => (
        currentSession.id === completedSession.id ? completedSession : currentSession
      ))));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to complete the Viva session.');
      await loadSessions();
    } finally {
      setPendingAction(null);
    }
  };

  const requeueSession = async () => {
    if (pendingAction || !requeueSessionId) return;
    const session = sessions.find((candidate) => candidate.id === requeueSessionId);
    if (!session || session.phase !== 'running' || session.result) return;

    setPendingAction({ sessionId: session.id, type: 'requeue' });
    setError('');
    try {
      const response = await fetch('/api/dashboard/supervisor/viva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'requeue-session', sessionId: session.id, version: session.version }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to requeue the Viva session.'));
      const nextSessions = readSessions(body);
      if (!nextSessions) throw new Error('Viva requeue response was invalid.');
      setSessions(orderSessions(nextSessions));
      setGradeDrafts(Object.fromEntries(nextSessions.map((candidate) => [candidate.id, candidate.result?.grade || ''])));
      setRequeueSessionId(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to requeue the Viva session.');
      await loadSessions();
    } finally {
      setPendingAction(null);
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
          description="Your assigned Viva agenda. Only panel admins can start, grade, or complete a session."
          action={<Button variant="outline" onClick={() => void loadSessions()} disabled={Boolean(pendingAction)}><RefreshCw size={16} />Reload</Button>}
        />
        {error && <p role="alert" className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-danger)]">{error}</p>}
        {!error && sessions.length === 0 && (
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">No Viva sessions are assigned to your panel.</p>
        )}
      </DashboardPanel>

      {sessions.map((session) => {
        const isStarting = pendingAction?.sessionId === session.id && pendingAction.type === 'start';
        const isSaving = pendingAction?.sessionId === session.id && pendingAction.type === 'save';
        const isCompleting = pendingAction?.sessionId === session.id && pendingAction.type === 'complete';
        const isRequeueing = pendingAction?.sessionId === session.id && pendingAction.type === 'requeue';
        const selectedGrade = gradeDrafts[session.id] ?? session.result?.grade ?? '';
        const hasUnsavedGrade = selectedGrade !== (session.result?.grade || '');
        return (
          <DashboardPanel key={session.id}>
            <SectionHeader
              title={session.project.title || 'Untitled project'}
              description={`${session.round.name} · ${session.locationLabel || 'Location not specified'}`}
              action={<Badge variant={session.phase === 'running' ? 'warning' : session.phase === 'completed' ? 'accent' : 'success'}>{session.phase}</Badge>}
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
            {session.phase === 'scheduled' && session.canManage && (
              <div className="mt-6 flex justify-end">
                <Button onClick={() => void startSession(session.id)} disabled={Boolean(pendingAction)}>
                  {isStarting ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
                  {isStarting ? 'Starting...' : 'Start Viva'}
                </Button>
              </div>
            )}
            {session.phase === 'running' && session.canManage && (
              <div className="mt-6 grid gap-4 border-t border-[var(--color-border)] pt-6 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
                <label className="grid gap-2 text-sm font-bold text-[var(--color-text)]">
                  Final grade
                  <Select
                    value={selectedGrade}
                    onChange={(event) => setGradeDrafts((current) => ({ ...current, [session.id]: event.target.value }))}
                    disabled={Boolean(pendingAction)}
                  >
                    <option value="">Select a grade</option>
                    {session.gradeScale.map((grade) => (
                      <option key={grade.grade} value={grade.grade}>{grade.grade} ({grade.percentage}%)</option>
                    ))}
                  </Select>
                </label>
                <Button onClick={() => void saveGrade(session)} disabled={Boolean(pendingAction) || !selectedGrade || !hasUnsavedGrade}>
                  {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  {isSaving ? 'Saving...' : 'Save grade'}
                </Button>
                <Button variant="success" onClick={() => void completeSession(session)} disabled={Boolean(pendingAction) || !session.result || hasUnsavedGrade}>
                  {isCompleting ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                  {isCompleting ? 'Completing...' : 'Complete Viva'}
                </Button>
                {!session.result && (
                  <Button variant="danger" onClick={() => setRequeueSessionId(session.id)} disabled={Boolean(pendingAction)}>
                    {isRequeueing ? <Loader2 className="animate-spin" size={16} /> : <XCircle size={16} />}
                    Cancel start and move last
                  </Button>
                )}
              </div>
            )}
            {session.phase === 'completed' && (
              <p className="mt-6 border-t border-[var(--color-border)] pt-4 text-sm font-semibold text-[var(--color-success)]">
                Completed{session.result ? ` with grade ${session.result.grade} (${session.result.percentage}%).` : '.'}
              </p>
            )}
          </DashboardPanel>
        );
      })}
      <Dialog
        open={Boolean(requeueSessionId)}
        onClose={() => setRequeueSessionId(null)}
        closeDisabled={Boolean(pendingAction)}
        title="Cancel this start and move the team last?"
        description="The running session will return to scheduled and later teams on this panel will move forward one slot."
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setRequeueSessionId(null)} disabled={Boolean(pendingAction)}>Keep running</Button>
            <Button variant="danger" onClick={() => void requeueSession()} disabled={Boolean(pendingAction)}>
              {pendingAction?.type === 'requeue' ? <Loader2 className="animate-spin" size={16} /> : <XCircle size={16} />}
              Confirm requeue
            </Button>
          </>
        )}
      >
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">Saved grades cannot be requeued. This action keeps the same team and panel but changes the queue times.</p>
      </Dialog>
    </div>
  );
}
