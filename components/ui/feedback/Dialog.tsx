"use client";

import type React from "react";
import { createPortal } from "react-dom";
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
