"use client";

import React from "react";
import Image from "next/image";
import { LogOut, Moon, MoreHorizontal, Sun, X } from "lucide-react";
import { cn } from "../shared/cn";
import { AvatarBadge } from "./AvatarBadge";

export type DashboardNavItem = {
  id: string;
  label: string;
  mobileLabel?: string;
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
  initials?: string;
};

export type DashboardShellProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  navItems: DashboardNavItem[];
  children: React.ReactNode;
  user?: DashboardUser;
  onSignOut?: () => void;
  showHomeSignOut?: boolean;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  mobilePrimaryIds?: string[];
  portalName?: React.ReactNode;
  logoSrc?: string;
  className?: string;
};

export const DashboardShell = ({
  title,
  description,
  navItems,
  children,
  user,
  onSignOut,
  showHomeSignOut = false,
  isDarkMode,
  onToggleTheme,
  mobilePrimaryIds = ["overview"],
  portalName = <>FYP <span className="text-[var(--color-accent-ink)]">Portal</span></>,
  logoSrc = "/logo.png",
  className = "",
}: DashboardShellProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const mobileMenuId = React.useId();
  const navSections = [...new Set(navItems.map((item) => item.section))];
  const primaryItems = mobilePrimaryIds.map((id) => navItems.find((item) => item.id === id)).filter((item): item is DashboardNavItem => Boolean(item));

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

  const selectItem = (item: DashboardNavItem) => {
    item.onClick?.();
    setMobileMenuOpen(false);
  };

  const sidebarContent = (
    <>
      <div className="flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
          <Image src={logoSrc} alt="University Logo" width={40} height={40} className="h-full w-full object-contain p-1" />
        </div>
        <div className="min-w-0 text-base font-bold tracking-tight text-[var(--color-text)]">{portalName}</div>
      </div>
      <nav className="portal-scrollbar mt-8 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1" aria-label="Dashboard navigation">
        {navSections.map((section) => (
          <div key={section || "navigation"} className="space-y-1" role={section ? "group" : undefined} aria-label={section}>
            {section && <p className="px-3 pb-1 text-[11px] font-semibold text-[var(--color-text-muted)]">{section}</p>}
            {navItems.filter((item) => item.section === section).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectItem(item)}
                aria-current={item.active ? "page" : undefined}
                className={cn("portal-nav-item flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors", item.active ? "bg-[var(--color-primary-soft)] text-[var(--color-text)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]", item.className)}
              >
                {item.icon && <span className={cn("shrink-0 text-[var(--color-text-muted)]", item.active && "text-[var(--color-nav-active)]", item.iconClassName)}>{item.icon}</span>}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge !== undefined && item.badge !== null && item.badge !== "" && <span className={cn("rounded-full bg-[var(--color-bg-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-muted)]", item.badgeClassName)}>{item.badge}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <div className={cn("flex min-h-[100dvh] bg-[var(--color-bg)] text-[var(--color-text)]", className)}>
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4 lg:flex">{sidebarContent}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
          <div className="mx-auto flex min-h-16 w-full max-w-[1500px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Image src={logoSrc} alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain lg:hidden" />
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">{title}</h1>
                {description && <p className="hidden truncate text-xs text-[var(--color-text-muted)] sm:block">{description}</p>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onToggleTheme && <button type="button" onClick={onToggleTheme} className="grid h-10 w-10 place-items-center rounded-xl text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]" aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}>{isDarkMode ? <Sun size={18} /> : <Moon size={18} />}</button>}
              {user && <div className="flex min-h-10 items-center gap-2 px-1.5">
                  <AvatarBadge name={user.name} initials={user.initials} className="h-8 w-8 rounded-lg text-xs" />
                  <span className="hidden max-w-28 truncate text-xs font-medium sm:block">{user.name}</span>
              </div>}
            </div>
          </div>
        </header>
        <main className="portal-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-7">
          <div className="mx-auto w-full max-w-[1500px]">
            {children}
            {showHomeSignOut && onSignOut && <div className="mt-8 flex justify-end"><button type="button" onClick={onSignOut} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"><LogOut size={16} />Log out</button></div>}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex min-h-[4.25rem] items-center justify-around border-t border-[var(--color-border)] bg-[var(--color-surface)] px-2 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Primary dashboard navigation">
        {primaryItems.map((item) => <button key={item.id} type="button" onClick={() => selectItem(item)} aria-current={item.active ? "page" : undefined} className={cn("flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium", item.active ? "text-[var(--color-nav-active)]" : "text-[var(--color-text-muted)]")}>{item.icon}<span className="max-w-full truncate">{item.mobileLabel || item.label}</span></button>)}
        <button type="button" onClick={() => setMobileMenuOpen(true)} className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium text-[var(--color-text-muted)]" aria-controls={mobileMenuId} aria-expanded={mobileMenuOpen}><MoreHorizontal size={18} /><span>More</span></button>
      </nav>

      {mobileMenuOpen && <div className="fixed inset-0 z-50 lg:hidden">
        <button type="button" aria-label="Close dashboard menu" className="absolute inset-0 bg-black/45" onClick={() => setMobileMenuOpen(false)} />
        <aside id={mobileMenuId} className="portal-mobile-menu absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-dialog)]" aria-label="All dashboard destinations">
          <div className="flex items-center justify-between"><span className="text-sm font-semibold">All destinations</span><button type="button" onClick={() => setMobileMenuOpen(false)} className="grid h-10 w-10 place-items-center rounded-lg" aria-label="Close dashboard menu"><X size={19} /></button></div>
          {sidebarContent}
        </aside>
      </div>}
    </div>
  );
};
