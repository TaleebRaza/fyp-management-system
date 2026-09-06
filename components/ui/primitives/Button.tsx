import type React from "react";
import { cn } from "../shared/cn";

export type ButtonVariant =
  | "primary"
  | "accent"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "success";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)]",
  accent:
    "bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]",
  secondary:
    "bg-[var(--color-surface-muted)] text-[var(--color-text)] hover:bg-[var(--color-bg-soft)]",
  outline:
    "border border-[var(--color-border)] bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]",
  ghost:
    "bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]",
  danger: "bg-[var(--color-danger)] text-white hover:opacity-90",
  success: "bg-[var(--color-success)] text-white hover:opacity-90",
};

export const Button = ({
  children,
  className = "",
  variant = "primary",
  type,
  ...props
}: ButtonProps) => (
  <button
    type={type ?? "button"}
    className={cn(
      "portal-button inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
      "disabled:cursor-not-allowed disabled:opacity-55",
      buttonVariants[variant],
      className
    )}
    {...props}
  >
    {children}
  </button>
);
