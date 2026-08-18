'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, RefreshCw, Send, Volume2 } from 'lucide-react';

import { APP_SETTINGS, PROGRAM_MAP } from '../../config/appSettings';
import { useAudioRecorder } from '../broadcast';
import type { BroadcastMode } from '../broadcast';
import { AudioBroadcastForm } from '../broadcast/AudioBroadcastForm';
import { BroadcastModeSelector } from '../broadcast/BroadcastModeSelector';
import { Badge, Button, DashboardPanel, Dialog, EmptyState, SectionHeader, TextArea } from '../ui';

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

export default function StudentMessagesPanel({ isDarkMode = false }: { isDarkMode?: boolean }) {
  const [messages, setMessages] = useState<StudentMessage[]>([]);
  const [selected, setSelected] = useState<StudentMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [replyMode, setReplyMode] = useState<BroadcastMode>('text');
  const [replyText, setReplyText] = useState('');
  const [error, setError] = useState('');
  const audioUploadId = useRef<string | null>(null);
  const {
    audioBlob,
    audioUrl,
    clearAudio,
    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
  } = useAudioRecorder();

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

  const sendReply = useCallback(async () => {
    if (!selected || isReplying || (replyMode === 'text' && !replyText.trim()) || (replyMode === 'audio' && !audioBlob)) {
      return;
    }

    setIsReplying(true);
    setError('');
    try {
      let reply: { type: 'text'; content: string } | { type: 'audio'; key: string };
      if (replyMode === 'text') {
        reply = { type: 'text', content: replyText };
      } else {
        if (!audioBlob || audioBlob.size > APP_SETTINGS.STUDENT_MESSAGE.MAX_AUDIO_BYTES) {
          throw new Error('Voice message exceeds the 1 MiB limit.');
        }
        audioUploadId.current ||= crypto.randomUUID();
        const contentType = APP_SETTINGS.STUDENT_MESSAGE.AUDIO_CONTENT_TYPE;
        const reservationResponse = await fetch('/api/voice/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            purpose: 'student-message',
            contentType,
            fileSize: audioBlob.size,
            idempotencyKey: audioUploadId.current,
          }),
        });
        const reservation: { uploadUrl?: string; key?: string; error?: string } =
          await reservationResponse.json().catch(() => ({}));
        if (!reservationResponse.ok || !reservation.uploadUrl || !reservation.key) {
          if (reservationResponse.status === 409 && /expired|no longer active/i.test(reservation.error || '')) {
            audioUploadId.current = null;
          }
          throw new Error(reservation.error || 'Unable to reserve the voice upload.');
        }

        const uploadResponse = await fetch(reservation.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: audioBlob,
        });
        if (!uploadResponse.ok) throw new Error('Voice upload failed. Try again.');
        reply = { type: 'audio', key: reservation.key };
      }

      const response = await fetch('/api/admin/student-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selected._id,
          messageId: selected.studentMessageId,
          ...reply,
        }),
      });
      const data: { error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to send the reply.');

      setMessages((current) => current.filter((message) =>
        message._id !== selected._id || message.studentMessageId !== selected.studentMessageId
      ));
      setSelected(null);
      setReplyText('');
      clearAudio();
      audioUploadId.current = null;
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Unable to send the reply.');
    } finally {
      setIsReplying(false);
    }
  }, [audioBlob, clearAudio, isReplying, replyMode, replyText, selected]);

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
                onClick={() => {
                  stopRecording();
                  clearAudio();
                  audioUploadId.current = null;
                  setReplyText('');
                  setReplyMode('text');
                  setSelected(message);
                }}
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
        onClose={() => {
          if (isReplying) return;
          stopRecording();
          clearAudio();
          audioUploadId.current = null;
          setReplyText('');
          setReplyMode('text');
          setSelected(null);
        }}
        closeDisabled={isReplying}
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
            {error && <p role="alert" className="mt-3 text-sm font-semibold text-[var(--color-danger)]">{error}</p>}
            <div className="mt-5 border-t border-[var(--color-border)] pt-5">
              <p className="mb-3 text-sm font-bold text-[var(--color-text)]">Reply to student</p>
              <BroadcastModeSelector
                disabled={isReplying}
                isDarkMode={isDarkMode}
                mode={replyMode}
                onChange={setReplyMode}
              />
              {replyMode === 'text' ? (
                <div>
                  <TextArea
                    value={replyText}
                    disabled={isReplying}
                    maxLength={APP_SETTINGS.STUDENT_MESSAGE.MAX_TEXT_LENGTH}
                    placeholder="Write a short reply..."
                    onChange={(event) => setReplyText(event.target.value)}
                  />
                  <p className="mt-1 text-right text-xs text-[var(--color-text-muted)]">
                    {replyText.length}/{APP_SETTINGS.STUDENT_MESSAGE.MAX_TEXT_LENGTH}
                  </p>
                </div>
              ) : (
                <AudioBroadcastForm
                  audioUrl={audioUrl}
                  hasAudio={audioBlob !== null}
                  isDarkMode={isDarkMode}
                  isRecording={isRecording}
                  recordingTime={recordingTime}
                  onClearAudio={() => {
                    clearAudio();
                    audioUploadId.current = null;
                  }}
                  onStartRecording={() => void startRecording()}
                  onStopRecording={stopRecording}
                  disabled={isReplying}
                  recordLabel="Record reply"
                />
              )}
              <Button
                className="mt-4"
                onClick={() => void sendReply()}
                disabled={
                  isReplying
                  || (replyMode === 'text' ? !replyText.trim() : !audioBlob)
                }
              >
                {isReplying ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Send reply
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
