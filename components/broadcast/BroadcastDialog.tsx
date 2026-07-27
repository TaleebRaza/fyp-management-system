'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Megaphone, Send, X } from 'lucide-react';
import { AudioBroadcastForm } from './AudioBroadcastForm';
import { BroadcastModeSelector } from './BroadcastModeSelector';
import { BroadcastSuccessState } from './BroadcastSuccessState';
import { TextBroadcastForm } from './TextBroadcastForm';
import type { BroadcastMode, BroadcastTheme } from './broadcastTypes';

type BroadcastDialogProps = {
  audioUrl: string | null;
  hasAudio: boolean;
  isDarkMode: boolean;
  isOpen: boolean;
  isRecording: boolean;
  isSubmitting: boolean;
  mode: BroadcastMode;
  onClearActive: () => void;
  onClearAudio: () => void;
  onClose: () => void;
  onModeChange: (mode: BroadcastMode) => void;
  onPublish: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onTextChange: (value: string) => void;
  recordingTime: number;
  success: boolean;
  textContent: string;
  theme?: BroadcastTheme;
};

export function BroadcastDialog({
  audioUrl,
  hasAudio,
  isDarkMode,
  isOpen,
  isRecording,
  isSubmitting,
  mode,
  onClearActive,
  onClearAudio,
  onClose,
  onModeChange,
  onPublish,
  onStartRecording,
  onStopRecording,
  onTextChange,
  recordingTime,
  success,
  textContent,
  theme,
}: BroadcastDialogProps) {
  const publishDisabled =
    isSubmitting ||
    (mode === 'text' && !textContent.trim()) ||
    (mode === 'audio' && !hasAudio);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 md:bg-black/60 md:backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={`relative w-full max-w-md p-6 md:p-8 rounded-[2rem] border shadow-2xl md:backdrop-blur-3xl overflow-hidden flex flex-col ${
              isDarkMode
                ? 'bg-[#18181b] md:bg-[#18181b]/95 border-white/10 text-white'
                : 'bg-white md:bg-white/95 border-neutral-200/50 text-black'
            }`}
          >
            <button
              onClick={onClose}
              className={`absolute top-5 right-5 p-2 rounded-full transition-colors z-10 ${
                isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
              }`}
            >
              <X size={20} className="opacity-60" />
            </button>

            {success ? (
              <BroadcastSuccessState />
            ) : (
              <>
                <div
                  className={`w-14 h-14 rounded-2xl mb-6 flex items-center justify-center ${
                    theme?.lightBg || 'bg-blue-500/10'
                  } ${theme?.text || 'text-blue-500'} shadow-sm`}
                >
                  <Megaphone size={28} />
                </div>

                <h3 className="text-2xl font-extrabold tracking-tight mb-2">
                  New Broadcast
                </h3>
                <p className="opacity-70 mb-6 font-medium leading-relaxed text-sm">
                  Send a quick audio note or text announcement specifically to your
                  assigned teams.
                </p>

                <BroadcastModeSelector
                  isDarkMode={isDarkMode}
                  mode={mode}
                  onChange={onModeChange}
                />

                <div className="mb-6 flex-1">
                  {mode === 'text' ? (
                    <TextBroadcastForm
                      isDarkMode={isDarkMode}
                      value={textContent}
                      onChange={onTextChange}
                      theme={theme}
                    />
                  ) : (
                    <AudioBroadcastForm
                      audioUrl={audioUrl}
                      hasAudio={hasAudio}
                      isDarkMode={isDarkMode}
                      isRecording={isRecording}
                      recordingTime={recordingTime}
                      onClearAudio={onClearAudio}
                      onStartRecording={onStartRecording}
                      onStopRecording={onStopRecording}
                      theme={theme}
                    />
                  )}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={onClearActive}
                    disabled={isSubmitting}
                    className="text-xs font-bold text-red-500 hover:text-red-600 opacity-80 hover:opacity-100 transition-opacity"
                  >
                    Clear Active
                  </button>
                  <button
                    onClick={onPublish}
                    disabled={publishDisabled}
                    className={`px-6 py-3 rounded-xl text-white font-bold transition-transform active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                      theme?.bg || 'bg-blue-500'
                    }`}
                  >
                    {isSubmitting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
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
}
