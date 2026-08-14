'use client';

import { Mic, Type } from 'lucide-react';
import type { BroadcastMode } from './broadcastTypes';

type BroadcastModeSelectorProps = {
  disabled?: boolean;
  isDarkMode: boolean;
  mode: BroadcastMode;
  onChange: (mode: BroadcastMode) => void;
};

export function BroadcastModeSelector({
  disabled = false,
  isDarkMode,
  mode,
  onChange,
}: BroadcastModeSelectorProps) {
  return (
    <div
      className={`flex p-1 mb-5 rounded-xl border ${
        isDarkMode
          ? 'bg-neutral-900 border-neutral-800'
          : 'bg-neutral-100 border-neutral-200'
      }`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('text')}
        className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-lg transition-all ${
          mode === 'text'
            ? isDarkMode
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'bg-white text-black shadow-sm'
            : 'text-neutral-500 hover:text-inherit'
        }`}
      >
        <Type size={16} /> Text
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('audio')}
        className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-lg transition-all ${
          mode === 'audio'
            ? isDarkMode
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'bg-white text-black shadow-sm'
            : 'text-neutral-500 hover:text-inherit'
        }`}
      >
        <Mic size={16} /> Voice (60s)
      </button>
    </div>
  );
}
