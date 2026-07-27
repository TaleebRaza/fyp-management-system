'use client';

import { Megaphone } from 'lucide-react';
import type { BroadcastTheme } from './broadcastTypes';

type BroadcastLauncherProps = {
  onOpen: () => void;
  theme?: BroadcastTheme;
};

export function BroadcastLauncher({ onOpen, theme }: BroadcastLauncherProps) {
  return (
    <button
      onClick={onOpen}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all font-bold text-xs shadow-sm ${theme?.lightBg || 'bg-blue-500/10'} ${theme?.text || 'text-blue-500'} hover:scale-105 shrink-0`}
    >
      <Megaphone size={14} />
      <span className="hidden sm:inline">Broadcast</span>
    </button>
  );
}
