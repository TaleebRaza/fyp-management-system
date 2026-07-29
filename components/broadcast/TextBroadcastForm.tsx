'use client';

import type { ChangeEvent } from 'react';
import type { BroadcastTheme } from './broadcastTypes';

type TextBroadcastFormProps = {
  isDarkMode: boolean;
  value: string;
  onChange: (value: string) => void;
  theme?: BroadcastTheme;
};

export function TextBroadcastForm({
  isDarkMode,
  value,
  onChange,
  theme,
}: TextBroadcastFormProps) {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  return (
    <textarea
      value={value}
      onChange={handleChange}
      placeholder="Write an announcement for your students..."
      className={`w-full h-32 px-5 py-4 rounded-2xl border-2 border-transparent transition-all duration-300 outline-none resize-none text-sm shadow-inner ${
        isDarkMode
          ? 'bg-neutral-900 text-white placeholder-neutral-500'
          : 'bg-neutral-100/70 text-black placeholder-neutral-400'
      } ${theme?.ring || 'focus:ring-blue-500'} focus:bg-transparent`}
      maxLength={500}
    />
  );
}
