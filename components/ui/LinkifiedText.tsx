import React from 'react';

const trimTrailingUrlPunctuation = (value: string) => {
  const match = value.match(/[.,!?;:)\]}]+$/);
  return match
    ? { url: value.slice(0, -match[0].length), trailing: match[0] }
    : { url: value, trailing: '' };
};

const getSafeHref = (value: string) => {
  const normalizedValue = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;

  try {
    const url = new URL(normalizedValue);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
};

export function LinkifiedText({ text, className = '' }: { text: string; className?: string }) {
  const source = String(text || '');
  const parts: React.ReactNode[] = [];
  const urlPattern = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
  let lastIndex = 0;

  source.replace(urlPattern, (match, _unused, offset) => {
    if (offset > lastIndex) parts.push(source.slice(lastIndex, offset));

    const { url, trailing } = trimTrailingUrlPunctuation(match);
    const href = getSafeHref(url);
    parts.push(
      href ? <a key={`${href}-${offset}`} href={href} target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--color-accent)] underline decoration-[var(--color-accent)]/40 underline-offset-4 transition-colors hover:text-[var(--color-accent-hover)]" onClick={(event) => event.stopPropagation()}>{url}</a> : match
    );
    if (trailing) parts.push(trailing);
    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < source.length) parts.push(source.slice(lastIndex));
  return <span className={className}>{parts.length > 0 ? parts : source}</span>;
}
