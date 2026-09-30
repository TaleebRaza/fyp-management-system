import type React from "react";
import { Card } from "../primitives/Card";
import { cn } from "../shared/cn";

export type StatCardProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  isActive?: boolean;
};

export const StatCard = ({ label, value, hint, icon, className = "", onClick, isActive = false }: StatCardProps) => {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-text-soft)]">{label}</p>
          <div className="mt-1.5 text-2xl font-black tracking-tight text-[var(--color-text)]">{value}</div>
        </div>
        {icon && <div className="portal-stat-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-bg-soft)] text-[var(--color-primary)]">{icon}</div>}
      </div>
      {hint && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--color-text-muted)]">{hint}</p>}
    </>
  );

  const classes = cn("p-4", isActive && "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/15", className);
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn("portal-card portal-motion-card w-full rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left shadow-[var(--shadow-card)] hover:border-[var(--color-border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40", isActive && "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/15", className)}>
        {content}
      </button>
    );
  }
  return <Card className={classes}>{content}</Card>;
};
