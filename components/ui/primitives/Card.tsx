import { cn } from "../shared/cn";
import type { CommonProps } from "../shared/types";

export const Card = ({ children, className = "" }: CommonProps) => (
  <div className={cn("portal-card portal-motion-card rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] sm:p-5", className)}>
    {children}
  </div>
);
