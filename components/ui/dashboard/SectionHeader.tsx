import type React from "react";
import { cn } from "../shared/cn";

export type SectionHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export const SectionHeader = ({ title, description, action, className = "" }: SectionHeaderProps) => (
  <div className={cn("mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
    <div className="min-w-0">
      <h2 className="text-base font-extrabold tracking-tight text-[var(--color-text)] sm:text-lg">{title}</h2>
      {description && <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--color-text-muted)] sm:text-sm">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);
