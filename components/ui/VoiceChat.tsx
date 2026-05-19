'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Send, Play, Loader2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const VoiceChat = ({ projectId, currentUserId, theme, isDarkMode }: any) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  
  // --- OPTIMIZATION: Hardware Security State Tracking ---
  const [micStatus, setMicStatus] = useState<'idle' | 'requesting' | 'denied'>('idle');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const timerIntervalRef = useRef<any>(null);

  // 1. Fetch History & Trigger Lazy Garbage Collection on the Backend
  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/voice?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.notes || []);
      }
    } catch (err) {
      console.error('Failed to fetch voice notes', err);
    }
  };

  useEffect(() => {
    if (projectId) fetchMessages();
    return () => clearInterval(timerIntervalRef.current);
  }, [projectId]);

  // 2. Hardware Microphone Initialization
  const startRecording = async () => {
    setMicStatus('requesting');
    try {
      // The browser's immutable security boundary intercepts here
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStatus('idle'); // Permission granted, reset state
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = handleUpload;
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Strict 60-second hardware cutoff to prevent Vercel storage bloat
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 59) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.warn("Hardware access blocked by user or browser security policy.");
      setMicStatus('denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      clearInterval(timerIntervalRef.current);
    }
  };

  // 3. Client-Side Streaming Handshake
  const handleUpload = async () => {
    setIsUploading(true);
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const file = new File([audioBlob], `voicenote-${Date.now()}.webm`, { type: 'audio/webm' });

    try {
      const { upload } = await import('@vercel/blob/client');
      
      // Stream directly to Vercel via our strict audio gatekeeper
      const newBlob = await upload(file.name, file, {
        access: 'private',
        handleUploadUrl: '/api/voice/upload',
      });

      // Save ledger to MongoDB
      await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, senderId: currentUserId, blobUrl: newBlob.url })
      });

      fetchMessages();
    } catch (error) {
      console.error('Audio upload failed:', error);
      alert('Failed to send voice note. Please try again.');
    } finally {
      setIsUploading(false);
      setRecordingTime(0);
    }
  };

  // 4. Mark as Played (Starts the 10-min doom timer)
  const handlePlay = async (noteId: string, blobUrl: string, isPlayed: boolean) => {
    if (!isPlayed) {
      await fetch('/api/voice', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId })
      });
      // Optimistically update UI
      setMessages(messages.map(m => m._id === noteId ? { ...m, isPlayed: true } : m));
    }
    
    // Redirect to the secure streaming reader to bypass standard browser blocks on private blobs
    window.open(`/api/read-pdf?url=${encodeURIComponent(blobUrl)}`, '_blank');
  };

  return (
    <div className={`p-4 rounded-2xl border flex flex-col gap-4 transition-colors duration-300 ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'}`}>
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
          messages.map((msg) => (
            <div key={msg._id} className={`p-2.5 rounded-xl border flex items-center justify-between ${msg.senderId._id === currentUserId ? (isDarkMode ? 'bg-neutral-800 border-neutral-700 ml-6' : 'bg-neutral-50 border-neutral-200 ml-6') : (isDarkMode ? 'bg-black/20 border-neutral-800 mr-6' : 'bg-neutral-100 border-neutral-200 mr-6')}`}>
              <div className="flex items-center gap-3">
                <button onClick={() => handlePlay(msg._id, msg.blobUrl, msg.isPlayed)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95 ${theme.bg} text-white shadow-md`}>
                  <Play size={14} className="ml-0.5" />
                </button>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black">{msg.senderId._id === currentUserId ? 'You' : msg.senderId.name}</span>
                  <span className={`text-[8px] font-bold uppercase ${msg.isPlayed ? 'text-red-400' : 'text-emerald-500'}`}>
                    {msg.isPlayed ? 'Played (Expiring)' : 'New'}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="pt-3 flex items-center gap-3">
        {micStatus === 'denied' ? (
          <div className="w-full flex flex-col gap-2">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Mic size={16} className="shrink-0" />
              <p className="text-[10px] font-bold leading-tight">
                Microphone access blocked. Click the lock icon in your browser's address bar to allow access and try again.
              </p>
            </div>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setMicStatus('idle')} className="w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-neutral-500/10 hover:bg-neutral-500/20 transition-colors">
              Dismiss
            </motion.button>
          </div>
        ) : isRecording ? (
          <div className="flex-1 flex items-center gap-3">
            <div className={`flex-1 h-10 rounded-xl flex items-center px-4 gap-2 bg-red-500/10 text-red-500 border border-red-500/20`}>
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
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} disabled={isUploading || micStatus === 'requesting'} onClick={startRecording} className={`w-full h-10 rounded-xl text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-colors ${isUploading || micStatus === 'requesting' ? 'bg-neutral-500 cursor-not-allowed' : theme.bg}`}>
            {isUploading ? <><Loader2 size={16} className="animate-spin" /> Uploading...</> : micStatus === 'requesting' ? <><Loader2 size={16} className="animate-spin" /> Waiting for Permission...</> : <><Mic size={16} /> Record Note (Max 60s)</>}
          </motion.button>
        )}
      </div>
    </div>
  );
};