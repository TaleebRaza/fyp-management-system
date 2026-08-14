'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageCircle, RefreshCw, Volume2 } from 'lucide-react';

import { PROGRAM_MAP } from '../../config/appSettings';
import { Badge, Button, DashboardPanel, Dialog, EmptyState, SectionHeader } from '../ui';

type StudentMessage = {
  _id: string;
  name: string;
  rollNo: string;
  program?: string;
  studentMessageId: string;
  studentMessageType: 'text' | 'audio';
  studentMessageContent: string;
  studentMessageCreatedAt: string;
  studentMessageAcknowledgedAt: string | null;
};

type MessagesResponse = {
  messages?: StudentMessage[];
  error?: string;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function StudentMessagesPanel() {
  const [messages, setMessages] = useState<StudentMessage[]>([]);
  const [selected, setSelected] = useState<StudentMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [error, setError] = useState('');

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/student-messages', { cache: 'no-store' });
      const data: MessagesResponse = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load student messages.');
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load student messages.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMessages(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMessages]);

  const acknowledge = useCallback(async (message: StudentMessage) => {
    if (message.studentMessageAcknowledgedAt || isAcknowledging) return;

    setIsAcknowledging(true);
    try {
      const response = await fetch('/api/admin/student-messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: message._id,
          messageId: message.studentMessageId,
        }),
      });
      const data: { acknowledgedAt?: string; error?: string } = await response.json().catch(() => ({}));
      if (!response.ok || !data.acknowledgedAt) {
        throw new Error(data.error || 'Unable to acknowledge the message.');
      }

      const applyAcknowledgement = (candidate: StudentMessage) =>
        candidate._id === message._id && candidate.studentMessageId === message.studentMessageId
          ? { ...candidate, studentMessageAcknowledgedAt: data.acknowledgedAt || null }
          : candidate;
      setMessages((current) => current.map(applyAcknowledgement));
      setSelected((current) => current ? applyAcknowledgement(current) : null);
    } catch (acknowledgementError) {
      const acknowledgementMessage = acknowledgementError instanceof Error
        ? acknowledgementError.message
        : 'Unable to acknowledge the message.';
      setSelected(null);
      await loadMessages();
      setError(acknowledgementMessage);
    } finally {
      setIsAcknowledging(false);
    }
  }, [isAcknowledging, loadMessages]);

  useEffect(() => {
    if (!selected || selected.studentMessageType !== 'text' || selected.studentMessageAcknowledgedAt) {
      return;
    }
    const timer = window.setTimeout(() => void acknowledge(selected), 0);
    return () => window.clearTimeout(timer);
  }, [acknowledge, selected]);

  return (
    <>
      <DashboardPanel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeader
            title="Student messages"
            description="Current messages sent directly to the admin."
          />
          <Button variant="outline" disabled={isLoading} onClick={() => void loadMessages()}>
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>

        {error && <p role="alert" className="mt-4 text-sm font-semibold text-[var(--color-danger)]">{error}</p>}

        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">
            <Loader2 className="mr-2 animate-spin" size={18} />
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            className="mt-5"
            icon={<MessageCircle size={24} />}
            title="No student messages"
            description="Messages will appear here when a student sends one."
          />
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {messages.map((message) => (
              <button
                type="button"
                key={`${message._id}:${message.studentMessageId}`}
                onClick={() => setSelected(message)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors hover:bg-[var(--color-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--color-text)]">{message.name}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-[var(--color-text-muted)]">
                      {message.rollNo} · {PROGRAM_MAP[message.program || ''] || message.program || 'Program not set'}
                    </p>
                  </div>
                  <Badge variant={message.studentMessageAcknowledgedAt ? 'muted' : 'warning'}>
                    {message.studentMessageAcknowledgedAt ? 'Seen' : 'New'}
                  </Badge>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold text-[var(--color-text-muted)]">
                  <span className="inline-flex items-center gap-1.5">
                    {message.studentMessageType === 'audio' && <Volume2 size={14} />}
                    {message.studentMessageType === 'audio' ? 'Voice' : 'Text'}
                  </span>
                  <time dateTime={message.studentMessageCreatedAt}>{formatTime(message.studentMessageCreatedAt)}</time>
                </div>
              </button>
            ))}
          </div>
        )}
      </DashboardPanel>

      <Dialog
        open={selected !== null}
        title={selected?.name || 'Student message'}
        description={selected
          ? `${selected.rollNo} · ${PROGRAM_MAP[selected.program || ''] || selected.program || 'Program not set'}`
          : undefined}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Badge variant={selected.studentMessageAcknowledgedAt ? 'muted' : 'warning'}>
                {selected.studentMessageAcknowledgedAt ? 'Seen' : 'New'}
              </Badge>
              <time className="text-xs font-semibold text-[var(--color-text-muted)]" dateTime={selected.studentMessageCreatedAt}>
                {formatTime(selected.studentMessageCreatedAt)}
              </time>
            </div>
            {selected.studentMessageType === 'text' ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-[var(--color-text)]">
                {selected.studentMessageContent}
              </p>
            ) : (
              <audio
                controls
                className="w-full"
                src={`/api/read-pdf?url=${encodeURIComponent(selected.studentMessageContent)}`}
                onEnded={() => void acknowledge(selected)}
              />
            )}
            {isAcknowledging && (
              <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
                <Loader2 size={14} className="animate-spin" />
                Marking acknowledged...
              </p>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
