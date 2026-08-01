import type React from "react";
import { cn } from "../shared/cn";

export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextArea = ({
  className = "",
  ...props
}: TextAreaProps) => (
  <textarea
    className={cn(
      "portal-focus-lift min-h-28 w-full resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-soft)]",
      "focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]",
      "disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)] disabled:opacity-60",
      className
    )}
    {...props}
  />
);
