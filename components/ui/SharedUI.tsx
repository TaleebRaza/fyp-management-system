// components/ui/SharedUI.tsx
"use client";

import React from "react";
import Image from "next/image";
import { createPortal } from "react-dom";

type IconComponent = React.ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
}>;

type CommonProps = {
  className?: string;
  children?: React.ReactNode;
};

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

export const Card = ({
  children,
  className = "",
}: CommonProps) => (
  <div
    className={cn(
      "portal-card portal-motion-card p-5 sm:p-6 md:p-8 transition-colors duration-200",
      className
    )}
  >
    {children}
  </div>
);

// Compatibility export: existing dashboards still import GlassCard.
// Ponytail: keep the name for now to avoid a risky multi-file rename.
export const GlassCard = ({
  children,
  className = "",
}: CommonProps & { isDarkMode?: boolean }) => (
  <Card className={className}>{children}</Card>
);

type StyledInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon?: IconComponent;
  isDarkMode?: boolean;
  theme?: unknown;
  wrapperClassName?: string;
};

export const StyledInput = ({
  icon: Icon,
  disabled,
  value,
  className = "",
  wrapperClassName = "",
  ...props
}: StyledInputProps) => {
  const isControlled = value !== undefined || props.onChange !== undefined;

  return (
    <div className={cn("relative", wrapperClassName)}>
      {Icon && (
        <Icon
          aria-hidden
          size={18}
          className={cn(
            "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-soft)] transition-colors",
            disabled ? "opacity-40" : "peer-focus:text-[var(--color-primary)]"
          )}
        />
      )}

      <input
        disabled={disabled}
        className={cn(
          "peer portal-focus-lift h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-soft)]",
          "focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]",
          "disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)] disabled:opacity-60",
          Icon ? "pl-10" : "",
          className
        )}
        {...props}
        {...(isControlled ? { value: value ?? "" } : {})}
      />
    </div>
  );
};

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  wrapperClassName?: string;
};

export const TextArea = ({
  className = "",
  wrapperClassName = "",
  ...props
}: TextAreaProps) => (
  <div className={wrapperClassName}>
    <textarea
      className={cn(
        "portal-focus-lift min-h-28 w-full resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-soft)]",
        "focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]",
        "disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)] disabled:opacity-60",
        className
      )}
      {...props}
    />
  </div>
);

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  wrapperClassName?: string;
};

export const Select = ({
  className = "",
  wrapperClassName = "",
  children,
  ...props
}: SelectProps) => (
  <div className={wrapperClassName}>
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
  </div>
);

type ButtonVariant =
  | "primary"
  | "accent"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "success";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]",
  accent:
    "bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent-hover)]",
  secondary:
    "bg-[var(--color-surface-muted)] text-[var(--color-text)] hover:bg-[var(--color-bg-soft)]",
  outline:
    "border border-[var(--color-border)] bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]",
  ghost:
    "bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]",
  danger:
    "bg-[var(--color-danger)] text-white hover:opacity-90",
  success:
    "bg-[var(--color-success)] text-white hover:opacity-90",
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

type BadgeVariant =
  | "default"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "muted";

type BadgeProps = CommonProps & {
  variant?: BadgeVariant;
};

const badgeVariants: Record<BadgeVariant, string> = {
  default:
    "bg-[var(--color-primary-soft)] text-[var(--color-primary)] dark:text-white",
  accent:
    "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
  success:
    "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  warning:
    "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  danger:
    "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  muted:
    "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]",
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

type SectionHeaderProps = {
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

type StatCardProps = {
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
    isActive ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20" : "",
    className
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "portal-card portal-motion-card w-full p-5 text-left transition-colors duration-200 hover:bg-[var(--color-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
          isActive ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20" : "",
          className
        )}
      >
        {content}
      </button>
    );
  }

  return <Card className={cardClassName}>{content}</Card>;
};

type EmptyStateProps = {
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

type DialogSize = "sm" | "md" | "lg" | "xl";

type DialogProps = {
  open: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  size?: DialogSize;
  closeLabel?: string;
};

const dialogSizes: Record<DialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

export const Dialog = ({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  size = "md",
  closeLabel = "Close dialog",
}: DialogProps) => {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center px-3 py-3 sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-dialog-title"
    >
      <button
        type="button"
        aria-label={closeLabel}
        className="portal-dialog-backdrop absolute inset-0 cursor-default bg-black/60"
        onClick={onClose}
      />

      <div
        className={cn(
          "portal-dialog portal-dialog-motion relative z-10 flex max-h-[calc(100vh-1.5rem)] w-full flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl",
          dialogSizes[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2
              id="portal-dialog-title"
              className="text-lg font-bold tracking-tight text-[var(--color-text)]"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                {description}
              </p>
            )}
          </div>

          <Button
            variant="ghost"
            className="min-h-9 rounded-lg px-3"
            onClick={onClose}
            aria-label={closeLabel}
          >
            ×
          </Button>
        </div>

        {children && (
          <div className="portal-scrollbar overflow-y-auto px-5 py-5">
            {children}
          </div>
        )}

        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export type DashboardNavItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  badge?: React.ReactNode;
  className?: string;
  iconClassName?: string;
  badgeClassName?: string;
  onClick?: () => void;
};

type DashboardUser = {
  name?: string;
  role?: string;
  initials?: string;
};

type DashboardShellProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  navItems: DashboardNavItem[];
  children: React.ReactNode;
  actions?: React.ReactNode;
  user?: DashboardUser;
  portalName?: React.ReactNode;
  logoSrc?: string;
  className?: string;
};

const getInitials = (name?: string) => {
  if (!name) return "FP";

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("");

  return initials || "FP";
};

export const AvatarBadge = ({
  name,
  initials,
  className = "",
}: {
  name?: string;
  initials?: string;
  className?: string;
}) => (
  <div
    className={cn(
      "portal-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-sm font-bold text-white",
      className
    )}
    aria-hidden="true"
  >
    {initials || getInitials(name)}
  </div>
);

export const DashboardShell = ({
  title,
  description,
  navItems,
  children,
  actions,
  user,
  portalName = (
    <>
      FYP <span className="text-[var(--color-accent)]">Portal</span>
    </>
  ),
  logoSrc = "/logo.png",
  className = "",
}: DashboardShellProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
const mobileMenuId = React.useId();

React.useEffect(() => {
  if (!mobileMenuOpen) return;

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setMobileMenuOpen(false);
    }
  };

  const handleResize = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setMobileMenuOpen(false);
    }
  };

  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", handleResize);

  return () => {
    document.body.style.overflow = previousOverflow;
    document.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("resize", handleResize);
  };
}, [mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const renderNavItem = (item: DashboardNavItem) => (
    <button
      key={item.id}
      type="button"
      onClick={() => {
        item.onClick?.();
        closeMobileMenu();
      }}
      className={cn(
        "portal-nav-item flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors",
        item.active
          ? "portal-nav-item-active bg-[var(--color-accent-soft)] text-[var(--color-text)]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]",
        item.className
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        {item.icon && (
          <span
            className={cn(
              "shrink-0",
              item.active
                ? "text-[var(--color-accent)]"
                : "text-[var(--color-text-soft)]",
                  item.iconClassName
            )}
          >
            {item.icon}
          </span>
        )}
        <span className="truncate">{item.label}</span>
      </span>

      {item.badge && (
        <span
            className={cn(
              "ml-2 shrink-0 rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs font-bold text-[var(--color-text-muted)]",
              item.badgeClassName
            )}
          >
          {item.badge}
        </span>
      )}
    </button>
  );

  const sidebarContent = (
    <>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
          <Image src={logoSrc} alt="University Logo" width={44} height={44} className="h-full w-full object-contain p-1" />
        </div>

        <div className="min-w-0">
          <div className="truncate text-lg font-bold tracking-tight text-[var(--color-text)]">
            {portalName}
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Management System
          </p>
        </div>
      </div>

      <nav className="mt-8 flex flex-col gap-1.5" aria-label="Dashboard navigation">
        {navItems.map(renderNavItem)}
      </nav>

      {user && (
        <div className="mt-auto pt-6">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <div className="flex items-center gap-3">
              <AvatarBadge name={user.name} initials={user.initials} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[var(--color-text)]">
                  {user.name || "Portal User"}
                </p>
                {user.role && (
                  <p className="truncate text-xs font-semibold text-[var(--color-text-muted)]">
                    {user.role}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "min-h-[calc(100vh-6.5rem)] rounded-none border-0 bg-transparent sm:rounded-2xl sm:border sm:border-[var(--color-border)] sm:bg-[var(--color-bg)] lg:min-h-[calc(100vh-6rem)] lg:overflow-hidden",
        className
      )}
    >
      <div className="flex min-h-[calc(100vh-6.5rem)] lg:min-h-[calc(100vh-6rem)]">
        <aside className="hidden w-68 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:flex lg:flex-col">
          {sidebarContent}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="z-30 bg-transparent lg:static lg:border-b lg:border-[var(--color-border)] lg:bg-[var(--color-surface)]">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 shadow-[var(--shadow-card)] sm:px-6 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--color-border)] px-3 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)]"
                aria-label="Open dashboard menu"
                aria-controls={mobileMenuId}
                aria-expanded={mobileMenuOpen}
              >
                Menu
              </button>

              <div className="min-w-0 text-center">
                <p className="truncate text-sm font-bold text-[var(--color-text)]">
                  {title}
                </p>
                {description && (
                  <p className="truncate text-xs text-[var(--color-text-muted)]">
                    {description}
                  </p>
                )}
              </div>

              <AvatarBadge name={user?.name} initials={user?.initials} className="h-10 w-10 rounded-xl" />
            </div>

            <div className="hidden px-6 py-5 lg:flex lg:items-center lg:justify-between lg:gap-6">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold tracking-tight text-[var(--color-text)]">
                  {title}
                </h1>
                {description && (
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                    {description}
                  </p>
                )}
              </div>

              {actions && <div className="shrink-0">{actions}</div>}
            </div>

            {actions && (
              <div className="mt-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-card)] sm:p-4 lg:hidden">
                <div className="portal-mobile-actions">{actions}</div>
              </div>
            )}
          </header>

          <main className="portal-scrollbar portal-content-enter min-w-0 flex-1 overflow-visible px-0 py-5 sm:p-6 lg:overflow-y-auto">
            {children}
          </main>
        </div>
      </div>

      {mobileMenuOpen && (
      <div className="fixed inset-0 z-[120] lg:hidden">
        <button
          type="button"
          aria-label="Close dashboard menu"
          className="absolute inset-0 cursor-default bg-black/60"
          onClick={closeMobileMenu}
        />

        <aside
          id={mobileMenuId}
          className="portal-mobile-menu absolute left-0 top-0 flex h-full w-[min(22rem,86vw)] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-dialog)]"
          aria-label="Mobile dashboard navigation"
        >
            <div className="mb-5 flex items-center justify-between gap-3">
              <p className="text-sm font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                Navigation
              </p>

              <button
                type="button"
                onClick={closeMobileMenu}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] text-lg font-bold text-[var(--color-text)]"
                aria-label="Close dashboard menu"
              >
                ×
              </button>
            </div>

            {sidebarContent}
          </aside>
        </div>
      )}
    </div>
  );
};

type DashboardGridProps = {
  children: React.ReactNode;
  className?: string;
  columns?: "auto" | "two" | "three" | "four";
};

const dashboardGridColumns: Record<NonNullable<DashboardGridProps["columns"]>, string> = {
  auto: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
  two: "grid-cols-1 lg:grid-cols-2",
  three: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
  four: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
};

export const DashboardGrid = ({
  children,
  className = "",
  columns = "auto",
}: DashboardGridProps) => (
  <div className={cn("portal-grid grid gap-5 sm:gap-4", dashboardGridColumns[columns], className)}>
    {children}
  </div>
);

export const DashboardPanel = ({
  children,
  className = "",
}: CommonProps) => (
  <Card className={cn("portal-panel p-5 sm:p-6", className)}>
    {children}
  </Card>
);

const trimTrailingUrlPunctuation = (value: string) => {
  const match = value.match(/[.,!?;:)\]}]+$/);

  if (!match) {
    return { url: value, trailing: "" };
  }

  return {
    url: value.slice(0, -match[0].length),
    trailing: match[0],
  };
};

const getSafeHref = (value: string) => {
  const trimmedValue = value.trim();
  const normalizedValue = /^https?:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  try {
    const url = new URL(normalizedValue);

    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
};

export const LinkifiedText = ({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) => {
  const source = String(text || "");
  const parts: React.ReactNode[] = [];
  const urlPattern = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
  let lastIndex = 0;

  source.replace(urlPattern, (match, _unused, offset) => {
    if (offset > lastIndex) {
      parts.push(source.slice(lastIndex, offset));
    }

    const { url, trailing } = trimTrailingUrlPunctuation(match);
    const href = getSafeHref(url);

    if (href) {
      parts.push(
        <a
          key={`${href}-${offset}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-[var(--color-accent)] underline decoration-[var(--color-accent)]/40 underline-offset-4 transition-colors hover:text-[var(--color-accent-hover)]"
          onClick={(event) => event.stopPropagation()}
        >
          {url}
        </a>
      );
    } else {
      parts.push(match);
    }

    if (trailing) {
      parts.push(trailing);
    }

    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < source.length) {
    parts.push(source.slice(lastIndex));
  }

  return <span className={className}>{parts.length > 0 ? parts : source}</span>;
};
