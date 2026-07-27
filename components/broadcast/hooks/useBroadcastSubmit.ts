'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BroadcastMode } from '../broadcastTypes';

type UseBroadcastSubmitOptions = {
  audioBlob: Blob | null;
  mode: BroadcastMode;
  onClearComplete: () => void;
  onPublishComplete: () => void;
  textContent: string;
};

type BroadcastSubmitState = {
  clearActive: () => Promise<void>;
  isSubmitting: boolean;
  publish: () => Promise<void>;
  success: boolean;
};

export function useBroadcastSubmit({
  audioBlob,
  mode,
  onClearComplete,
  onPublishComplete,
  textContent,
}: UseBroadcastSubmitOptions): BroadcastSubmitState {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const scheduleCompletion = useCallback((callback: () => void) => {
    if (completionTimerRef.current !== null) {
      clearTimeout(completionTimerRef.current);
    }

    completionTimerRef.current = setTimeout(() => {
      completionTimerRef.current = null;
      setSuccess(false);
      callback();
    }, 1500);
  }, []);

  const clearActive = useCallback(async () => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setIsSubmitting(true);
    try {
      await fetch('/api/dashboard/supervisor/broadcast', { method: 'DELETE' });
      setSuccess(true);
      scheduleCompletion(onClearComplete);
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [onClearComplete, scheduleCompletion]);

  const publish = useCallback(async () => {
    if (inFlightRef.current) return;
    if (mode === 'text' && !textContent.trim()) return;
    if (mode === 'audio' && !audioBlob) return;

    inFlightRef.current = true;
    setIsSubmitting(true);
    try {
      let finalContent = textContent;
      let finalSize = 0;

      if (mode === 'audio' && audioBlob) {
        const contentType = audioBlob.type || 'audio/webm';
        const uploadRes = await fetch('/api/voice/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentType,
            fileSize: audioBlob.size,
          }),
        });
        const uploadData = await uploadRes.json();

        if (!uploadRes.ok) {
          throw new Error(uploadData.error || 'Upload failed');
        }

        const r2Res = await fetch(uploadData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: audioBlob,
        });

        if (!r2Res.ok) {
          throw new Error('Cloud upload failed');
        }

        finalContent = uploadData.key;
        finalSize = audioBlob.size;
      }

      const res = await fetch('/api/dashboard/supervisor/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broadcastType: mode,
          broadcastContent: finalContent,
          broadcastSize: finalSize,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save broadcast');
      }

      setSuccess(true);
      scheduleCompletion(onPublishComplete);
    } catch {
      alert('Error publishing broadcast. Please try again.');
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }, [audioBlob, mode, onPublishComplete, scheduleCompletion, textContent]);

  useEffect(() => {
    return () => {
      if (completionTimerRef.current !== null) {
        clearTimeout(completionTimerRef.current);
      }
    };
  }, []);

  return {
    clearActive,
    isSubmitting,
    publish,
    success,
  };
}
