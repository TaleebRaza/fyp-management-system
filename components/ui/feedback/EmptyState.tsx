import type React from "react";
import { cn } from "../shared/cn";

export type EmptyStateProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
};

export const EmptyState = ({
  title,
  description,
  action,
  icon,
  className = "",
}: EmptyStateProps) => (
  <div
    className={cn(
      "portal-empty-state rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-8 text-center",
      className
    )}
  >
    {icon && (
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-surface)] text-[var(--color-text-muted)]">
        {icon}
      </div>
    )}
    <h3 className="text-sm font-bold text-[var(--color-text)]">{title}</h3>
    {description && (
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--color-text-muted)]">
        {description}
      </p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
