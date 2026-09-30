"use client";

import React from "react";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { cn } from "../shared/cn";
import { AvatarBadge } from "./AvatarBadge";

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
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    const handleResize = () => {
      if (window.matchMedia("(min-width: 1024px)").matches) setMobileMenuOpen(false);
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
        "portal-nav-item group flex min-h-10 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] font-bold transition-colors",
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
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
              item.active
                ? "bg-[var(--color-accent)] text-black"
                : "bg-[var(--color-bg-soft)] text-[var(--color-text-soft)] group-hover:text-[var(--color-text)]",
              item.iconClassName
            )}
          >
            {item.icon}
          </span>
        )}
        <span className="truncate">{item.label}</span>
      </span>
      {item.badge !== undefined && item.badge !== null && item.badge !== '' && (
        <span
          className={cn(
            "ml-2 shrink-0 rounded-full bg-[var(--color-bg-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--color-text-muted)]",
            item.active && "bg-[var(--color-surface)] text-[var(--color-text)]",
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
      <div className="flex items-center gap-3 px-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
          <Image src={logoSrc} alt="University Logo" width={40} height={40} className="h-full w-full object-contain p-1" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-extrabold tracking-tight text-[var(--color-text)]">{portalName}</div>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-text-soft)]">Management System</p>
        </div>
      </div>

      <nav className="portal-scrollbar mt-7 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1" aria-label="Dashboard navigation">
        {navSections.map((section) => (
          <div key={section || 'navigation'} className="space-y-1" role={section ? 'group' : undefined} aria-label={section}>
            {section && (
              <p className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--color-text-soft)]">{section}</p>
            )}
            {navItems.filter((item) => item.section === section).map(renderNavItem)}
          </div>
        ))}
      </nav>

      {user && (
        <div className="mt-5 border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center gap-3 rounded-xl p-2">
            <AvatarBadge name={user.name} initials={user.initials} className="h-9 w-9 rounded-lg text-xs" />
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-[var(--color-text)]">{user.name || "Portal User"}</p>
              {user.role && <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--color-text-muted)]">{user.role}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className={cn("min-h-[calc(100vh-6.5rem)] overflow-hidden rounded-none bg-[var(--color-bg)] sm:rounded-[1.5rem] sm:border sm:border-[var(--color-border)] lg:min-h-[calc(100vh-6rem)]", className)}>
      <div className="flex min-h-[calc(100vh-6.5rem)] lg:min-h-[calc(100vh-6rem)]">
        <aside className="hidden w-64 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4 lg:flex lg:flex-col">{sidebarContent}</aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
            <div className="flex min-h-[4.5rem] items-center justify-between gap-3 px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] text-[var(--color-text)] lg:hidden"
                  aria-label="Open dashboard menu"
                  aria-controls={mobileMenuId}
                  aria-expanded={mobileMenuOpen}
                >
                  <Menu size={18} />
                </button>
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-extrabold tracking-tight text-[var(--color-text)] sm:text-xl">{title}</h1>
                  {description && <p className="mt-0.5 hidden truncate text-xs text-[var(--color-text-muted)] sm:block">{description}</p>}
                </div>
              </div>
              {actions && <div className="portal-shell-actions shrink-0">{actions}</div>}
            </div>
          </header>

          <main className="portal-scrollbar portal-content-enter min-w-0 flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
            <div className="mx-auto w-full max-w-[1500px]">{children}</div>
          </main>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[120] lg:hidden">
          <button type="button" aria-label="Close dashboard menu" className="absolute inset-0 cursor-default bg-black/55" onClick={closeMobileMenu} />
          <aside id={mobileMenuId} className="portal-mobile-menu absolute left-0 top-0 flex h-full w-[min(20rem,88vw)] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-dialog)]" aria-label="Mobile dashboard navigation">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Navigation</p>
              <button type="button" onClick={closeMobileMenu} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-border)] text-[var(--color-text)]" aria-label="Close dashboard menu"><X size={17} /></button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}
    </div>
  );
};
