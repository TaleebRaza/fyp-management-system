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

export const StatCard = ({
  label,
  value,
  hint,
  icon,
  className = "",
  onClick,
  isActive = false,
}: StatCardProps) => {
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">
            {label}
          </p>
          <div className="mt-2 text-2xl font-bold tracking-tight text-[var(--color-text)]">
            {value}
          </div>
        </div>
        {icon && (
          <div className="portal-stat-icon rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2 text-[var(--color-primary)]">
            {icon}
          </div>
        )}
      </div>
      {hint && (
        <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
          {hint}
        </p>
      )}
    </>
  );

  const cardClassName = cn(
    "p-5",
    isActive
      ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20"
      : "",
    className
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "portal-card portal-motion-card w-full p-5 text-left transition-colors duration-200 hover:bg-[var(--color-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
          isActive
            ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20"
            : "",
          className
        )}
      >
        {content}
      </button>
    );
  }

  return <Card className={cardClassName}>{content}</Card>;
};
