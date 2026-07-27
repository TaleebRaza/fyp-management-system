'use client';

import { Mic, Square } from 'lucide-react';
import type { BroadcastTheme } from './broadcastTypes';

type AudioBroadcastFormProps = {
  audioUrl: string | null;
  hasAudio: boolean;
  isDarkMode: boolean;
  isRecording: boolean;
  recordingTime: number;
  onClearAudio: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  theme?: BroadcastTheme;
};

export function AudioBroadcastForm({
  audioUrl,
  hasAudio,
  isDarkMode,
  isRecording,
  recordingTime,
  onClearAudio,
  onStartRecording,
  onStopRecording,
  theme,
}: AudioBroadcastFormProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-8 px-4 rounded-2xl border-2 border-dashed transition-colors ${
        isDarkMode
          ? 'border-neutral-700 bg-neutral-900/50'
          : 'border-neutral-200 bg-neutral-50'
      }`}
    >
      {hasAudio && audioUrl ? (
        <audio src={audioUrl} controls className="w-full max-w-[250px] mb-4" />
      ) : (
        <div className="text-3xl font-mono font-black tracking-widest mb-6">
          00:{recordingTime.toString().padStart(2, '0')}
        </div>
      )}

      {!hasAudio && (
        <button
          onClick={isRecording ? onStopRecording : onStartRecording}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-all ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 animate-pulse scale-110'
              : `${theme?.bg || 'bg-blue-500 hover:bg-blue-600'}`
          }`}
        >
          {isRecording ? (
            <Square size={24} fill="currentColor" />
          ) : (
            <Mic size={28} />
          )}
        </button>
      )}

      {hasAudio && (
        <button
          onClick={onClearAudio}
          className="text-sm font-bold text-red-500 hover:text-red-600 mt-2"
        >
          Delete &amp; Rerecord
        </button>
      )}
    </div>
  );
}
