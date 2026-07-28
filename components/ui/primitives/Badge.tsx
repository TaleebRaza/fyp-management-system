import { cn } from "../shared/cn";
import type { CommonProps } from "../shared/types";

export type BadgeVariant =
  | "default"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "muted";

export type BadgeProps = CommonProps & {
  variant?: BadgeVariant;
};

const badgeVariants: Record<BadgeVariant, string> = {
  default:
    "bg-[var(--color-primary-soft)] text-[var(--color-primary)] dark:text-white",
  accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
  success: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  muted: "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]",
};

export const Badge = ({
  children,
  className = "",
  variant = "default",
}: BadgeProps) => (
  <span
    className={cn(
      "portal-badge inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
      badgeVariants[variant],
      className
    )}
  >
    {children}
  </span>
);
