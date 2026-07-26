'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, FileText, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export type DialogOptions = {
  type?: 'alert' | 'confirm' | 'prompt';
  title: string;
  message: string;
  onConfirm?: (value?: string) => unknown;
  defaultValue?: string;
  inputType?: 'text' | 'select' | 'email';
  inputOptions?: string[];
  placeholder?: string;
};

export type PortalDialogState = Required<DialogOptions> & {
  isOpen: boolean;
};

export type ShowDialog = (options: DialogOptions) => void;

export default function PortalDialog({
  dialog,
  closeDialog,
}: {
  dialog: PortalDialogState;
  closeDialog: () => void;
}) {
  const [inputValue, setInputValue] = useState(dialog.defaultValue);

  useEffect(() => {
    if (dialog.isOpen) setInputValue(dialog.defaultValue || '');
  }, [dialog.isOpen, dialog.defaultValue]);

  const isDanger =
    dialog.type === 'confirm' ||
    dialog.title.includes('Error') ||
    dialog.title.includes('Warning');

  const handleConfirm = () => {
    const confirmedValue = inputValue;

    // Prompt callbacks can safely open a follow-up dialog after this one closes.
    closeDialog();

    Promise.resolve(
      dialog.type === 'prompt'
        ? dialog.onConfirm(confirmedValue)
        : dialog.onConfirm()
    ).catch((error) => {
      console.error('Dialog confirm handler failed:', error);
    });
  };

  return (
    <AnimatePresence>
      {dialog.isOpen && (
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center p-3 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <motion.button
            type="button"
            aria-label="Close dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 cursor-default bg-black/60"
            onClick={closeDialog}
          />

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.16 }}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-dialog)]"
          >
            <div className="border-b border-[var(--color-border)] px-5 py-4">
              <div
                className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${
                  isDanger
                    ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                    : 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                }`}
              >
                {dialog.type === 'prompt' ? (
                  <FileText size={22} />
                ) : isDanger ? (
                  <XCircle size={22} />
                ) : (
                  <CheckCircle size={22} />
                )}
              </div>

              <h3 className="text-lg font-bold tracking-tight text-[var(--color-text)]">
                {dialog.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                {dialog.message}
              </p>
            </div>

            {dialog.type === 'prompt' && (
              <div className="px-5 py-4">
                {dialog.inputType === 'select' && dialog.inputOptions ? (
                  <select
                    autoFocus
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
                  >
                    <option value="" disabled>
                      -- Make a selection --
                    </option>
                    {dialog.inputOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : dialog.inputType === 'email' ? (
                  <input
                    type="email"
                    autoFocus
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    placeholder="Enter new email..."
                    className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-accent)]"
                  />
                ) : (
                  <textarea
                    autoFocus
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    placeholder={dialog.placeholder || 'Enter details...'}
                    rows={4}
                    className="min-h-28 w-full resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-semibold text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-accent)]"
                  />
                )}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-4 sm:flex-row sm:justify-end">
              {(dialog.type === 'prompt' || dialog.type === 'confirm') && (
                <button
                  type="button"
                  onClick={closeDialog}
                  className="min-h-10 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface)]"
                >
                  Cancel
                </button>
              )}

              <button
                type="button"
                onClick={handleConfirm}
                className={`min-h-10 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                  isDanger
                    ? 'bg-[var(--color-danger)] text-white hover:opacity-90'
                    : 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]'
                }`}
              >
                {dialog.type === 'confirm' ? 'Confirm' : dialog.type === 'prompt' ? 'Save Changes' : 'OK'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
