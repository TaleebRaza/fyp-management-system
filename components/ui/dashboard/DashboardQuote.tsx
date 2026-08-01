'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { cn } from '../shared/cn';
import {
  parseDashboardQuote,
  type DashboardQuote as DashboardQuoteData,
} from './dashboardQuote';

const RANDOM_QUOTE_URL = 'https://dummyjson.com/quotes/random';
const LAST_QUOTE_STORAGE_KEY = 'fyp-dashboard-quote-id';

type DashboardQuoteProps = {
  className?: string;
};

const fetchQuote = async (signal: AbortSignal): Promise<DashboardQuoteData | null> => {
  try {
    const response = await fetch(RANDOM_QUOTE_URL, { signal });
    return response.ok ? parseDashboardQuote(await response.json()) : null;
  } catch {
    return null;
  }
};

export const DashboardQuote = ({ className }: DashboardQuoteProps) => {
  const [quote, setQuote] = useState<DashboardQuoteData | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadQuote = async () => {
      const previousQuoteId = window.sessionStorage.getItem(LAST_QUOTE_STORAGE_KEY);
      let nextQuote = await fetchQuote(controller.signal);

      if (nextQuote && String(nextQuote.id) === previousQuoteId) {
        nextQuote = await fetchQuote(controller.signal);
      }

      if (nextQuote && !controller.signal.aborted) {
        window.sessionStorage.setItem(LAST_QUOTE_STORAGE_KEY, String(nextQuote.id));
        setQuote(nextQuote);
      }
    };

    void loadQuote();
    return () => controller.abort();
  }, []);

  if (!quote) return null;

  return (
    <blockquote
      className={cn(
        'flex max-w-3xl items-start gap-2 text-sm leading-6 text-[var(--color-text-muted)]',
        className
      )}
    >
      <Sparkles
        aria-hidden="true"
        className="mt-1 shrink-0 text-[var(--color-accent)]"
        size={14}
      />
      <div>
        <p>“{quote.text}”</p>
        <cite className="block text-xs font-semibold not-italic text-[var(--color-text-soft)]">
          {quote.author}
        </cite>
      </div>
    </blockquote>
  );
};
