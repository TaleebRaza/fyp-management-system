'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const TITLE = 'FYP Management System';
const CREDIT = 'Created By: Taleeb Raza';

type ActiveLine = 'none' | 'title' | 'credit' | 'done';

type SessionIntroProps = {
  onComplete: () => void;
};

export default function SessionIntro({ onComplete }: SessionIntroProps) {
  const shouldReduceMotion = useReducedMotion();
  const completionSentRef = useRef(false);
  const [logoRaised, setLogoRaised] = useState(false);
  const [titleText, setTitleText] = useState('');
  const [creditText, setCreditText] = useState('');
  const [activeLine, setActiveLine] = useState<ActiveLine>('none');
  const [isExiting, setIsExiting] = useState(false);

  const finish = useCallback(() => {
    if (completionSentRef.current) return;

    completionSentRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    let cancelled = false;
    const timerIds = new Set<number>();

    const delay = (milliseconds: number) =>
      new Promise<void>((resolve) => {
        const timerId = window.setTimeout(() => {
          timerIds.delete(timerId);
          resolve();
        }, milliseconds);

        timerIds.add(timerId);
      });

    const typeText = async (
      text: string,
      updateText: (value: string) => void,
      millisecondsPerCharacter: number
    ) => {
      for (let index = 1; index <= text.length; index += 1) {
        await delay(millisecondsPerCharacter);
        if (cancelled) return;
        updateText(text.slice(0, index));
      }
    };

    const runSequence = async () => {
      if (shouldReduceMotion) {
        setLogoRaised(true);
        setTitleText(TITLE);
        setCreditText(CREDIT);
        setActiveLine('done');

        await delay(650);
        if (cancelled) return;

        setIsExiting(true);
        await delay(300);
        if (!cancelled) finish();
        return;
      }

      // Let the logo settle in the center before lifting it for the title.
      await delay(800);
      if (cancelled) return;
      setLogoRaised(true);

      await delay(650);
      if (cancelled) return;
      setActiveLine('title');
      await typeText(TITLE, setTitleText, 55);

      if (cancelled) return;
      await delay(180);
      if (cancelled) return;
      setActiveLine('credit');
      await typeText(CREDIT, setCreditText, 38);

      if (cancelled) return;
      setActiveLine('done');
      await delay(650);
      if (cancelled) return;

      setIsExiting(true);
      await delay(600);
      if (!cancelled) finish();
    };

    void runSequence();

    return () => {
      cancelled = true;
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
      timerIds.clear();
    };
  }, [finish, shouldReduceMotion]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: shouldReduceMotion ? 0.25 : 0.6, ease: 'easeInOut' }}
      className="fixed inset-0 z-[9999] overflow-hidden bg-black"
      aria-label="FYP Management System introduction"
      aria-busy={!isExiting}
    >
      <div className="sr-only">
        <h1>{TITLE}</h1>
        <p>{CREDIT}</p>
      </div>

      <div className="relative flex min-h-screen w-full items-center justify-center px-3">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.img
            src="/logo.png"
            alt="University Of Haripur logo"
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.76, y: '0vh' }}
            animate={{
              opacity: 1,
              scale: logoRaised ? 0.84 : 1,
              y: logoRaised ? '-16vh' : '0vh',
            }}
            transition={{
              opacity: { duration: 0.5, ease: 'easeOut' },
              scale: { duration: logoRaised ? 0.7 : 0.65, ease: [0.22, 1, 0.36, 1] },
              y: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
            }}
            className="h-[clamp(7rem,18vw,10rem)] w-[clamp(7rem,18vw,10rem)] object-contain drop-shadow-[0_18px_45px_rgba(252,163,17,0.16)]"
          />
        </div>

        <div
          className="absolute inset-x-3 top-[54%] flex flex-col items-center text-center"
          aria-hidden="true"
        >
          <h1 className="min-h-[1.35em] whitespace-nowrap text-[clamp(1.45rem,6.4vw,4.5rem)] font-black leading-none tracking-[-0.035em] text-[#fca311] drop-shadow-[0_4px_24px_rgba(252,163,17,0.2)]">
            {titleText}
            {activeLine === 'title' ? <TypingCaret className="bg-[#fca311]" /> : null}
          </h1>

          <p className="mt-5 min-h-[1.5em] whitespace-nowrap text-[clamp(0.85rem,2.3vw,1.2rem)] font-medium tracking-[0.08em] text-white/90 sm:mt-6">
            {creditText}
            {activeLine === 'credit' ? <TypingCaret className="bg-white" /> : null}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function TypingCaret({ className }: { className: string }) {
  return (
    <motion.span
      aria-hidden="true"
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.75, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
      className={`ml-1 inline-block h-[0.92em] w-[2px] align-[-0.06em] ${className}`}
    />
  );
}