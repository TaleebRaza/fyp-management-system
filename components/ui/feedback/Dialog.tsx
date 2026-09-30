"use client";

import type React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "../primitives/Button";
import { cn } from "../shared/cn";

export type DialogSize = "sm" | "md" | "lg" | "xl";
export type DialogProps = {
  open: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  size?: DialogSize;
  closeLabel?: string;
  closeDisabled?: boolean;
};

const dialogSizes: Record<DialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-5xl",
};

export const Dialog = ({ open, title, description, children, footer, onClose, size = "md", closeLabel = "Close dialog", closeDisabled = false }: DialogProps) => {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-2 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="portal-dialog-title">
      <button type="button" aria-label={closeLabel} className="portal-dialog-backdrop absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]" onClick={closeDisabled ? undefined : onClose} />
      <div className={cn("portal-dialog portal-dialog-motion relative z-10 flex max-h-[calc(100vh-1rem)] w-full flex-col overflow-hidden rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-dialog)] sm:max-h-[calc(100vh-2.5rem)]", dialogSizes[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="portal-dialog-title" className="truncate text-lg font-extrabold tracking-tight text-[var(--color-text)]">{title}</h2>
            {description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-muted)] sm:text-sm">{description}</p>}
          </div>
          <Button variant="ghost" className="h-9 min-h-9 w-9 shrink-0 rounded-xl p-0" onClick={onClose} disabled={closeDisabled} aria-label={closeLabel}><X size={17} /></Button>
        </div>
        {children && <div className="portal-scrollbar overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>}
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};
