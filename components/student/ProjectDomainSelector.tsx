'use client';

import { useState } from 'react';
import { ChevronDown, Globe, X } from 'lucide-react';
import {
  PROJECT_DOMAIN_GROUPS,
  getProjectDomainLabel,
} from '../../config/projectDomains';

type ProjectDomainSelectorProps = {
  selectedDomains: string[];
  legacyDomain?: string;
  disabled?: boolean;
  onChange: (domains: string[]) => void;
};

export default function ProjectDomainSelector({
  selectedDomains,
  legacyDomain = '',
  disabled = false,
  onChange,
}: ProjectDomainSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (disabled && isOpen) setIsOpen(false);

  const toggleDomain = (domainId: string) => {
    if (disabled) return;

    onChange(
      selectedDomains.includes(domainId)
        ? selectedDomains.filter((item) => item !== domainId)
        : [...selectedDomains, domainId]
    );
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="block text-sm font-semibold text-[var(--color-text)]">
          Project Domains
        </label>
        <span className="text-xs font-semibold text-[var(--color-text-muted)]">
          {selectedDomains.length} selected
        </span>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <button
          type="button"
          disabled={disabled}
          aria-expanded={isOpen}
          aria-controls="project-domain-options"
          onClick={() => setIsOpen((previous) => !previous)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-muted)] disabled:cursor-not-allowed disabled:opacity-65"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <Globe size={18} className="text-[var(--color-accent)]" />
            {selectedDomains.length > 0
              ? `${selectedDomains.length} domain${selectedDomains.length === 1 ? '' : 's'} selected`
              : 'Choose project domains'}
          </span>
          <ChevronDown
            size={18}
            className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {(selectedDomains.length > 0 || legacyDomain) && (
          <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] px-4 py-3">
            {selectedDomains.map((domainId) => (
              <span
                key={domainId}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-text)]"
              >
                {getProjectDomainLabel(domainId)}
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Remove ${getProjectDomainLabel(domainId)}`}
                    onClick={() => toggleDomain(domainId)}
                    className="rounded-full p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                  >
                    <X size={13} />
                  </button>
                )}
              </span>
            ))}

            {selectedDomains.length === 0 && legacyDomain && (
              <span className="inline-flex items-center rounded-full bg-[var(--color-surface-muted)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-muted)]">
                Previous value: {legacyDomain}
              </span>
            )}
          </div>
        )}

        {isOpen && !disabled && (
          <div
            id="project-domain-options"
            className="portal-scrollbar max-h-[28rem] space-y-5 overflow-y-auto border-t border-[var(--color-border)] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold leading-5 text-[var(--color-text-muted)]">
                Select every area that applies to this project.
              </p>
              {selectedDomains.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="shrink-0 text-xs font-bold text-[var(--color-text-strong)] underline-offset-4 hover:text-[var(--color-accent)] hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            {legacyDomain && selectedDomains.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
                Your previous text value is preserved above. Select one or more catalogue domains before the next submission.
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              {PROJECT_DOMAIN_GROUPS.map((group) => (
                <fieldset key={group.category} className="space-y-2">
                  <legend className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[var(--color-text-muted)]">
                    {group.category}
                  </legend>

                  {group.options.map((option) => {
                    const isChecked = selectedDomains.includes(option.id);

                    return (
                      <label
                        key={option.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${
                          isChecked
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                            : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleDomain(option.id)}
                          className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                        />
                        <span className="text-sm font-semibold leading-5 text-[var(--color-text)]">
                          {option.label}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
        You can select multiple domains, such as Machine Learning and Augmented Reality.
      </p>
    </div>
  );
}
