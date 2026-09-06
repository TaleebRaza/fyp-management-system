"use client";

import React from "react";
import Image from "next/image";
import { cn } from "../shared/cn";
import { AvatarBadge } from "./AvatarBadge";
import { DashboardQuote } from "./DashboardQuote";
import { usePortalBranding } from "../../branding/usePortalBranding";
import { getPortalDisplayName } from "../../../types/branding";

export type DashboardNavItem = {
  id: string;
  label: string;
  section?: string;
  icon?: React.ReactNode;
  active?: boolean;
  badge?: React.ReactNode;
  className?: string;
  iconClassName?: string;
  badgeClassName?: string;
  onClick?: () => void;
};

export type DashboardUser = {
  name?: string;
  role?: string;
  initials?: string;
};

export type DashboardShellProps = {
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

export const DashboardShell = ({
  title,
  description,
  navItems,
  children,
  actions,
  user,
  portalName,
  logoSrc,
  className = "",
}: DashboardShellProps) => {
  const branding = usePortalBranding();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const mobileMenuId = React.useId();
  const resolvedPortalName = portalName ?? getPortalDisplayName(branding);
  const resolvedLogoSrc = logoSrc ?? branding.logoUrl;

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
  const navSections = [...new Set(navItems.map((item) => item.section))];

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
          <Image
            src={resolvedLogoSrc}
            alt="University Logo"
            width={44}
            height={44}
            className="h-full w-full object-contain p-1"
          />
        </div>
        <div className="min-w-0">
          <div className="truncate text-lg font-bold tracking-tight text-[var(--color-text)]">
            {resolvedPortalName}
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Management System
          </p>
        </div>
      </div>

      <nav
        className="portal-scrollbar mt-8 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1"
        aria-label="Dashboard navigation"
      >
        {navSections.map((section) => (
          <div
            key={section || 'navigation'}
            className="space-y-1.5"
            role={section ? 'group' : undefined}
            aria-label={section}
          >
            {section && (
              <p className="px-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--color-text-soft)]">
                {section}
              </p>
            )}
            {navItems
              .filter((item) => item.section === section)
              .map(renderNavItem)}
          </div>
        ))}
      </nav>

      {user && (
        <div className="mt-6">
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
              <AvatarBadge
                name={user?.name}
                initials={user?.initials}
                className="h-10 w-10 rounded-xl"
              />
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

            <DashboardQuote className="mt-3 px-1 lg:-mt-3 lg:px-6 lg:pb-5" />

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
