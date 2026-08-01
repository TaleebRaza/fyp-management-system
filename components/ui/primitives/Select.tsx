import type React from "react";
import { cn } from "../shared/cn";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = ({
  className = "",
  children,
  ...props
}: SelectProps) => (
  <select
    className={cn(
      "portal-focus-lift h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-text)] outline-none transition-colors",
      "focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]",
      "disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)] disabled:opacity-60",
      className
    )}
    {...props}
  >
    {children}
  </select>
);
