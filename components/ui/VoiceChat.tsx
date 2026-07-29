'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Play, RefreshCw, Square } from 'lucide-react';
import { motion } from 'framer-motion';

type VoiceMessage = {
  _id: string;
  senderId: { _id: string; name: string };
  blobUrl: string;
  isPlayed: boolean;
  isUploading?: boolean;
  uploadError?: boolean;
  finalizeKey?: string;
};

type VoiceChatProps = {
  projectId: string;
  currentUserId: string;
  theme: { text?: string; bg?: string };
  isDarkMode: boolean;
};

export const VoiceChat = ({ projectId, currentUserId, theme, isDarkMode }: VoiceChatProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const uploadInFlightRef = useRef(false);
  const recordingInFlightRef = useRef(false);
  const localUrlsRef = useRef(new Set<string>());

  const revokeBlobUrl = useCallback((url: string) => {
    if (!url.startsWith('blob:') || !localUrlsRef.current.delete(url)) return;
    URL.revokeObjectURL(url);
  }, []);

  const fetchMessages = useCallback(async () => {
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    try {
      const response = await fetch(`/api/voice?projectId=${projectId}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Unable to load voice notes.');

      const data: { notes?: VoiceMessage[] } = await response.json();
      if (!controller.signal.aborted) setMessages(data.notes || []);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Failed to fetch voice notes', error);
      }
    } finally {
      if (fetchControllerRef.current === controller) fetchControllerRef.current = null;
    }
  }, [projectId]);

  useEffect(() => {
    const player = audioRef.current;
    const localUrls = localUrlsRef.current;
    void Promise.resolve().then(fetchMessages);
    return () => {
      fetchControllerRef.current?.abort();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      player?.pause();
      for (const url of localUrls) URL.revokeObjectURL(url);
      localUrls.clear();
    };
  }, [fetchMessages]);

  const handleUpload = useCallback(async () => {
    if (uploadInFlightRef.current) return;

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    if (audioBlob.size === 0) return;

    const file = new File([audioBlob], `voicenote-${Date.now()}.webm`, { type: 'audio/webm' });
    const localUrl = URL.createObjectURL(audioBlob);
    const optimisticId = `temp-${crypto.randomUUID()}`;
    let uploadedKey = '';
    let uploaded = false;

    localUrlsRef.current.add(localUrl);
    uploadInFlightRef.current = true;
    setIsUploading(true);
    setIsRecording(false);
    setRecordingTime(0);
    setMessages((previous) => [...previous, {
      _id: optimisticId,
      senderId: { _id: currentUserId, name: 'You' },
      blobUrl: localUrl,
      isPlayed: false,
      isUploading: true,
    }]);

    try {
      const idempotencyKey = crypto.randomUUID();
      const urlResponse = await fetch('/api/voice/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: file.type,
          fileSize: file.size,
          projectId,
          idempotencyKey,
        }),
      });
      const urlData: { uploadUrl?: string; key?: string; error?: string } = await urlResponse.json().catch(() => ({}));
      if (!urlResponse.ok || !urlData.uploadUrl || !urlData.key) {
        throw new Error(urlData.error || 'Failed to prepare voice upload.');
      }

      uploadedKey = urlData.key;
      const objectResponse = await fetch(urlData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!objectResponse.ok) throw new Error('Cloud upload rejected the voice note.');
      uploaded = true;

      const finalizeResponse = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, blobUrl: uploadedKey }),
      });
      const finalizeData: { error?: string } = await finalizeResponse.json().catch(() => ({}));
      if (!finalizeResponse.ok) {
        throw new Error(finalizeData.error || 'Voice note finalization failed.');
      }

      revokeBlobUrl(localUrl);
      setMessages((previous) => previous.filter((message) => message._id !== optimisticId));
      await fetchMessages();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voice note failed to send.';
      if (uploaded && uploadedKey) {
        setMessages((previous) => previous.map((voice) => voice._id === optimisticId
          ? { ...voice, isUploading: false, uploadError: true, finalizeKey: uploadedKey }
          : voice));
        alert(`${message} Retry sending to finalize the upload.`);
      } else {
        revokeBlobUrl(localUrl);
        setMessages((previous) => previous.filter((voice) => voice._id !== optimisticId));
        alert(message);
      }
    } finally {
      uploadInFlightRef.current = false;
      setIsUploading(false);
    }
  }, [currentUserId, fetchMessages, projectId, revokeBlobUrl]);

  const retryFinalization = useCallback(async (message: VoiceMessage) => {
    if (!message.finalizeKey || uploadInFlightRef.current) return;

    uploadInFlightRef.current = true;
    setIsUploading(true);
    setMessages((previous) => previous.map((voice) => voice._id === message._id
      ? { ...voice, isUploading: true, uploadError: false }
      : voice));

    try {
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, blobUrl: message.finalizeKey }),
      });
      const data: { error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Voice note finalization failed.');

      revokeBlobUrl(message.blobUrl);
      setMessages((previous) => previous.filter((voice) => voice._id !== message._id));
      await fetchMessages();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Voice note finalization failed.';
      setMessages((previous) => previous.map((voice) => voice._id === message._id
        ? { ...voice, isUploading: false, uploadError: true }
        : voice));
      alert(errorMessage);
    } finally {
      uploadInFlightRef.current = false;
      setIsUploading(false);
    }
  }, [fetchMessages, projectId, revokeBlobUrl]);

  const startRecording = async () => {
    if (isUploading || isRecording || recordingInFlightRef.current) return;

    recordingInFlightRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
        audioBitsPerSecond: 16000,
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = () => void handleUpload();
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((previous) => {
          if (previous >= 59) {
            stopRecording();
            return 60;
          }
          return previous + 1;
        });
      }, 1000);
    } catch {
      alert('Microphone access denied or unavailable.');
    } finally {
      recordingInFlightRef.current = false;
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === 'recording') {
      recorder.stop();
      recorder.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  const handlePlay = async (noteId: string, blobUrl: string, isPlayed: boolean) => {
    if (playingId === noteId && audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
      return;
    }

    if (!isPlayed && !noteId.startsWith('temp-')) {
      try {
        const response = await fetch('/api/voice', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ noteId }),
        });
        if (!response.ok) throw new Error('Unable to mark voice note as played.');
        setMessages((previous) => previous.map((voice) => voice._id === noteId
          ? { ...voice, isPlayed: true }
          : voice));
      } catch (error) {
        console.error('voice_mark_played_failed', error);
      }
    }

    if (audioRef.current) {
      audioRef.current.src = blobUrl.startsWith('blob:')
        ? blobUrl
        : `/api/read-pdf?url=${encodeURIComponent(blobUrl)}`;
      void audioRef.current.play().catch(() => setPlayingId(null));
      setPlayingId(noteId);
    }
  };

  return (
    <div className={`p-4 rounded-2xl border flex flex-col gap-4 transition-colors duration-300 ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'}`}>
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />
      <div className="flex justify-between items-center pb-2 border-b border-dashed border-neutral-500/20">
        <h4 className="text-xs font-black uppercase tracking-widest opacity-60 flex items-center gap-2">
          <Mic size={14} className={theme.text} /> Voice Chat
        </h4>
        <span className="text-[10px] font-bold opacity-40 uppercase">Auto-deletes after 10m</span>
      </div>

      <div className="flex-1 max-h-48 overflow-y-auto space-y-2 custom-scrollbar pr-1">
        {messages.length === 0 ? (
          <div className="text-center py-6 opacity-30">
            <Mic size={24} className="mx-auto mb-2" />
            <p className="text-[10px] font-bold uppercase">No Voice Notes</p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message._id} className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${message.isUploading ? 'opacity-70 grayscale' : ''} ${message.senderId._id === currentUserId ? (isDarkMode ? 'bg-neutral-800 border-neutral-700 ml-6' : 'bg-neutral-50 border-neutral-200 ml-6') : (isDarkMode ? 'bg-black/20 border-neutral-800 mr-6' : 'bg-neutral-100 border-neutral-200 mr-6')}`}>
              <div className="flex items-center gap-3">
                <button
                  disabled={message.isUploading || message.uploadError}
                  onClick={() => void handlePlay(message._id, message.blobUrl, message.isPlayed)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95 ${theme.bg} text-white shadow-md ${(message.isUploading || message.uploadError) ? 'cursor-not-allowed' : ''}`}
                >
                  {message.isUploading ? <Loader2 size={12} className="animate-spin" /> : (playingId === message._id ? <Square size={12} fill="currentColor" /> : <Play size={14} className="ml-0.5" />)}
                </button>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black">{message.senderId._id === currentUserId ? 'You' : message.senderId.name}</span>
                  <span className={`text-[8px] font-bold uppercase ${message.isUploading ? 'text-neutral-500' : (message.uploadError ? 'text-red-400' : (message.isPlayed ? 'text-red-400' : 'text-emerald-500'))}`}>
                    {message.isUploading ? 'Sending...' : (message.uploadError ? 'Retry required' : (message.isPlayed ? 'Played (Expiring)' : 'New'))}
                  </span>
                </div>
              </div>
              {message.uploadError && message.finalizeKey && (
                <button
                  type="button"
                  onClick={() => void retryFinalization(message)}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-red-300 px-2 text-[10px] font-bold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  <RefreshCw size={12} /> Retry
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="pt-3 flex items-center gap-3">
        {isRecording ? (
          <div className="flex-1 flex items-center gap-3">
            <div className="flex-1 h-10 rounded-xl flex items-center px-4 gap-2 bg-red-500/10 text-red-500 border border-red-500/20">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-mono font-bold tracking-widest text-red-500">
                00:{recordingTime < 10 ? `0${recordingTime}` : recordingTime}
              </span>
            </div>
            <motion.button whileTap={{ scale: 0.95 }} onClick={stopRecording} className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center shadow-lg">
              <Square size={16} fill="currentColor" />
            </motion.button>
          </div>
        ) : (
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} disabled={isUploading} onClick={() => void startRecording()} className={`w-full h-10 rounded-xl text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-colors ${isUploading ? 'bg-neutral-500 cursor-not-allowed' : theme.bg}`}>
            {isUploading ? <><Loader2 size={16} className="animate-spin" /> Uploading...</> : <><Mic size={16} /> Record Note (Max 60s)</>}
          </motion.button>
        )}
      </div>
    </div>
  );
};
