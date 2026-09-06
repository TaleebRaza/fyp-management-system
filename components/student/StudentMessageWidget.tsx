'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Send, Trash2, X } from 'lucide-react';

import { APP_SETTINGS } from '../../config/appSettings';
import { useAudioRecorder } from '../broadcast';
import type { BroadcastMode } from '../broadcast';
import { AudioBroadcastForm } from '../broadcast/AudioBroadcastForm';
import { BroadcastModeSelector } from '../broadcast/BroadcastModeSelector';
import { Badge, Button, TextArea } from '../ui';

type StudentMessage = {
  messageId: string;
  type: BroadcastMode;
  content: string;
  size: number;
  createdAt: string;
  acknowledgedAt: string | null;
  isAdminReply: boolean;
};

type MessageResponse = {
  message?: StudentMessage | null;
  error?: string;
};

const secureAudioUrl = (key: string) => `/api/read-pdf?url=${encodeURIComponent(key)}`;

export default function StudentMessageWidget({ isDarkMode }: { isDarkMode: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [message, setMessage] = useState<StudentMessage | null>(null);
  const [mode, setMode] = useState<BroadcastMode>('text');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const audioUploadId = useRef<string | null>(null);
  const mutationInFlight = useRef(false);
  const {
    audioBlob,
    audioUrl,
    clearAudio,
    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
  } = useAudioRecorder();

  const loadStatus = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/dashboard/student/message', { cache: 'no-store' });
      const data: MessageResponse = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load your message.');
      setMessage(data.message || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your message.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => void loadStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const close = () => {
    if (mutationInFlight.current) return;
    stopRecording();
    setIsOpen(false);
  };

  const send = async () => {
    if (mutationInFlight.current) return;
    if (mode === 'text' && !text.trim()) return;
    if (mode === 'audio' && !audioBlob) return;

    mutationInFlight.current = true;
    setIsMutating(true);
    setError('');
    try {
      let body: { type: 'text'; content: string } | { type: 'audio'; key: string };
      if (mode === 'text') {
        body = { type: 'text', content: text };
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
          if (
            reservationResponse.status === 409
            && /expired|no longer active/i.test(reservation.error || '')
          ) {
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
        body = { type: 'audio', key: reservation.key };
      }

      const response = await fetch('/api/dashboard/student/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data: MessageResponse = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to send the message.');

      setText('');
      clearAudio();
      audioUploadId.current = null;
      await loadStatus();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Unable to send the message.');
    } finally {
      mutationInFlight.current = false;
      setIsMutating(false);
    }
  };

  const remove = async () => {
    if (!message || mutationInFlight.current) return;
    if (!window.confirm('Delete your current message to the admin?')) return;

    mutationInFlight.current = true;
    setIsMutating(true);
    setError('');
    try {
      const response = await fetch('/api/dashboard/student/message', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.messageId }),
      });
      const data: MessageResponse = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to delete the message.');
      await loadStatus();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete the message.');
    } finally {
      mutationInFlight.current = false;
      setIsMutating(false);
    }
  };

  const canCompose = !message || message.isAdminReply || Boolean(message.acknowledgedAt);

  return (
    <>
      <button
        type="button"
        aria-label="Message admin"
        title="Message admin"
        onClick={() => setIsOpen(true)}
        className="fixed z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
        style={{
          bottom: 'max(1rem, env(safe-area-inset-bottom))',
          right: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <MessageCircle size={21} />
      </button>

      <section
        aria-hidden={!isOpen}
        aria-label="Message admin"
        className={`fixed z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl transition-all duration-200 ease-out ${
          isOpen
            ? 'visible translate-y-0 scale-100 opacity-100'
            : 'invisible pointer-events-none translate-y-3 scale-95 opacity-0'
        }`}
        style={{
          bottom: 'calc(max(1rem, env(safe-area-inset-bottom)) + 4rem)',
          right: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2 className="font-bold text-[var(--color-text)]">
              {message?.isAdminReply ? 'Admin reply' : 'Message admin'}
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-[var(--color-text-muted)]">
              {message?.isAdminReply
                ? 'Send a new text or voice message to reply.'
                : 'Send one text or voice message. You can replace it after the admin sees or hears it.'}
            </p>
          </div>
          <Button
            variant="ghost"
            className="min-h-9 rounded-lg px-2"
            onClick={close}
            disabled={isMutating}
            aria-label="Close message window"
          >
            <X size={18} />
          </Button>
        </div>

        <div className="portal-scrollbar max-h-[min(28rem,calc(100vh-12rem))] overflow-y-auto px-4 py-4">
          {isLoading ? (
            <div className="flex min-h-32 items-center justify-center text-sm font-semibold text-[var(--color-text-muted)]">
              <Loader2 size={18} className="mr-2 animate-spin" />
              Loading message...
            </div>
          ) : (
            <div className="space-y-5">
              {message && (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant={message.isAdminReply ? 'success' : message.acknowledgedAt ? 'success' : 'warning'}>
                      {message.isAdminReply
                        ? 'Admin reply'
                        : message.acknowledgedAt
                        ? message.type === 'audio' ? 'Heard' : 'Seen'
                        : 'Pending'}
                    </Badge>
                    {!message.isAdminReply && (
                      <Button
                        variant="ghost"
                        className="min-h-9 px-3 text-[var(--color-danger)]"
                        disabled={isMutating}
                        onClick={() => void remove()}
                      >
                        <Trash2 size={15} />
                        Delete
                      </Button>
                    )}
                  </div>
                  {message.type === 'text' ? (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text)]">
                      {message.content}
                    </p>
                  ) : (
                    <audio
                      controls
                      src={secureAudioUrl(message.content)}
                      className="mt-3 w-full"
                    />
                  )}
                  {!message.isAdminReply && !message.acknowledgedAt && (
                    <p className="mt-3 text-xs font-semibold text-[var(--color-text-muted)]">
                      You can delete this message, but cannot send another until the admin acknowledges it.
                    </p>
                  )}
                </div>
              )}

              {canCompose && (
                <div>
                  <BroadcastModeSelector
                    disabled={isMutating}
                    isDarkMode={isDarkMode}
                    mode={mode}
                    onChange={setMode}
                  />
                  {mode === 'text' ? (
                    <div>
                      <TextArea
                        value={text}
                        disabled={isMutating}
                        maxLength={APP_SETTINGS.STUDENT_MESSAGE.MAX_TEXT_LENGTH}
                        placeholder="Write a short message to the admin..."
                        onChange={(event) => setText(event.target.value)}
                      />
                      <p className="mt-1 text-right text-xs text-[var(--color-text-muted)]">
                        {text.length}/{APP_SETTINGS.STUDENT_MESSAGE.MAX_TEXT_LENGTH}
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
                      disabled={isMutating}
                    />
                  )}
                </div>
              )}

              {error && <p role="alert" className="text-sm font-semibold text-[var(--color-danger)]">{error}</p>}
            </div>
          )}
        </div>

        {canCompose && !isLoading && (
          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
            <Button
              className="w-full"
              onClick={() => void send()}
              disabled={isMutating || (mode === 'text' ? !text.trim() : !audioBlob)}
            >
              {isMutating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Send
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
