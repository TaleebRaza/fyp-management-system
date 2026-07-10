// components/dashboards/BroadcastWidget.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Megaphone, Mic, Type, X, Square, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function BroadcastWidget({ isDarkMode, theme }: any) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'text' | 'audio'>('text');
  const [textContent, setTextContent] = useState('');
  
  // Audio State
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Submit State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Ensure portal only renders on the client to prevent SSR hydration errors
  useEffect(() => {
    setMounted(true);
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 59) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      alert("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleClear = async () => {
    setIsSubmitting(true);
    try {
      await fetch('/api/dashboard/supervisor/broadcast', { method: 'DELETE' });
      setSuccess(true);
      setTimeout(() => { setIsOpen(false); setSuccess(false); }, 1500);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (mode === 'text' && !textContent.trim()) return;
    if (mode === 'audio' && !audioBlob) return;

    setIsSubmitting(true);
    try {
      let finalContent = textContent;
      let finalSize = 0;

      if (mode === 'audio' && audioBlob) {
        const uploadRes = await fetch('/api/voice/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: audioBlob.type || 'audio/webm', fileSize: audioBlob.size })
        });
        const uploadData = await uploadRes.json();
        
        if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');

        const r2Res = await fetch(uploadData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
          body: audioBlob
        });

        if (!r2Res.ok) throw new Error('Cloud upload failed');

        finalContent = uploadData.key;
        finalSize = audioBlob.size;
      }

      const res = await fetch('/api/dashboard/supervisor/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broadcastType: mode,
          broadcastContent: finalContent,
          broadcastSize: finalSize
        })
      });

      if (!res.ok) throw new Error('Failed to save broadcast');
      
      setSuccess(true);
      setTimeout(() => {
        setIsOpen(false);
        setSuccess(false);
        setTextContent('');
        setAudioBlob(null);
      }, 1500);
    } catch (err) {
      alert('Error publishing broadcast. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/80 md:bg-black/60 md:backdrop-blur-md"
          />
          
          {/* Modal Body */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={`relative w-full max-w-md p-6 md:p-8 rounded-[2rem] border shadow-2xl md:backdrop-blur-3xl overflow-hidden flex flex-col ${isDarkMode ? 'bg-[#18181b] md:bg-[#18181b]/95 border-white/10 text-white' : 'bg-white md:bg-white/95 border-neutral-200/50 text-black'}`}
          >
            <button 
              onClick={() => setIsOpen(false)} 
              className={`absolute top-5 right-5 p-2 rounded-full transition-colors z-10 ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'}`}
            >
              <X size={20} className="opacity-60" />
            </button>

            {success ? (
              <div className="flex flex-col items-center justify-center py-12 text-emerald-500">
                <CheckCircle2 size={56} className="mb-4" />
                <h3 className="text-2xl font-extrabold tracking-tight">Broadcast Live!</h3>
                <p className="opacity-70 mt-2 font-medium">Your students can now see this update.</p>
              </div>
            ) : (
              <>
                <div className={`w-14 h-14 rounded-2xl mb-6 flex items-center justify-center ${theme?.lightBg || 'bg-blue-500/10'} ${theme?.text || 'text-blue-500'} shadow-sm`}>
                  <Megaphone size={28} />
                </div>
                
                <h3 className="text-2xl font-extrabold tracking-tight mb-2">New Broadcast</h3>
                <p className="opacity-70 mb-6 font-medium leading-relaxed text-sm">Send a quick audio note or text announcement specifically to your assigned teams.</p>

                <div className={`flex p-1 mb-5 rounded-xl border ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-100 border-neutral-200'}`}>
                  <button onClick={() => setMode('text')} className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'text' ? (isDarkMode ? 'bg-neutral-800 text-white shadow-sm' : 'bg-white text-black shadow-sm') : 'text-neutral-500 hover:text-inherit'}`}>
                    <Type size={16} /> Text
                  </button>
                  <button onClick={() => setMode('audio')} className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'audio' ? (isDarkMode ? 'bg-neutral-800 text-white shadow-sm' : 'bg-white text-black shadow-sm') : 'text-neutral-500 hover:text-inherit'}`}>
                    <Mic size={16} /> Voice (60s)
                  </button>
                </div>

                <div className="mb-6 flex-1">
                  {mode === 'text' ? (
                    <textarea 
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      placeholder="Write an announcement for your students..."
                      className={`w-full h-32 px-5 py-4 rounded-2xl border-2 border-transparent transition-all duration-300 outline-none resize-none text-sm shadow-inner ${isDarkMode ? 'bg-neutral-900 text-white placeholder-neutral-500' : 'bg-neutral-100/70 text-black placeholder-neutral-400'} ${theme?.ring || 'focus:ring-blue-500'} focus:bg-transparent`}
                      maxLength={500}
                    />
                  ) : (
                    <div className={`flex flex-col items-center justify-center py-8 px-4 rounded-2xl border-2 border-dashed transition-colors ${isDarkMode ? 'border-neutral-700 bg-neutral-900/50' : 'border-neutral-200 bg-neutral-50'}`}>
                      {audioBlob ? (
                        <audio src={URL.createObjectURL(audioBlob)} controls className="w-full max-w-[250px] mb-4" />
                      ) : (
                        <div className="text-3xl font-mono font-black tracking-widest mb-6">
                          00:{recordingTime.toString().padStart(2, '0')}
                        </div>
                      )}
                      
                      {!audioBlob && (
                        <button 
                          onClick={isRecording ? stopRecording : startRecording}
                          className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-all ${isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse scale-110' : `${theme?.bg || 'bg-blue-500 hover:bg-blue-600'}`}`}
                        >
                          {isRecording ? <Square size={24} fill="currentColor" /> : <Mic size={28} />}
                        </button>
                      )}
                      
                      {audioBlob && (
                        <button onClick={() => setAudioBlob(null)} className="text-sm font-bold text-red-500 hover:text-red-600 mt-2">
                          Delete & Rerecord
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button onClick={handleClear} disabled={isSubmitting} className="text-xs font-bold text-red-500 hover:text-red-600 opacity-80 hover:opacity-100 transition-opacity">
                    Clear Active
                  </button>
                  <button 
                    onClick={handleSubmit}
                    disabled={isSubmitting || (mode === 'text' && !textContent.trim()) || (mode === 'audio' && !audioBlob)}
                    className={`px-6 py-3 rounded-xl text-white font-bold transition-transform active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${theme?.bg || 'bg-blue-500'}`}
                  >
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {isSubmitting ? 'Publishing...' : 'Publish'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all font-bold text-xs shadow-sm ${theme?.lightBg || 'bg-blue-500/10'} ${theme?.text || 'text-blue-500'} hover:scale-105 shrink-0`}
      >
        <Megaphone size={14} />
        <span className="hidden sm:inline">Broadcast</span>
      </button>
      {mounted && createPortal(modalContent, document.body)}
    </>
  );
}