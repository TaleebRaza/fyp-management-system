import type React from "react";
import { cn } from "../shared/cn";

export type SectionHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export const SectionHeader = ({
  title,
  description,
  action,
  className = "",
}: SectionHeaderProps) => (
  <div
    className={cn(
      "mb-5 flex flex-col gap-3 sm:mb-4 sm:flex-row sm:items-end sm:justify-between",
      className
    )}
  >
    <div>
      <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)]">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
          {description}
        </p>
      )}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);
