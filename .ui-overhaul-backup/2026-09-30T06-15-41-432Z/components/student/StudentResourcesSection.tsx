import { ExternalLink, FileText, Loader2, RefreshCcw, Settings } from 'lucide-react';
import { Button, DashboardPanel, SectionHeader } from '../ui';
import { getProjectStageLabel } from '../ui/Timeline';
import type { WordTemplate } from './studentDashboardTypes';

export default function StudentResourcesSection({
  currentStage,
  isFetchingTemplates,
  onFetchTemplates,
  visibleTemplates,
  onOpenTemplate,
  currentProgramName,
  batch,
  onOpenAcademicEditor,
}: {
  currentStage: string;
  isFetchingTemplates: boolean;
  onFetchTemplates: () => void;
  visibleTemplates: WordTemplate[];
  onOpenTemplate: (template: WordTemplate) => void;
  currentProgramName: string;
  batch?: string;
  onOpenAcademicEditor: () => void;
}) {
  return (
    <div className="grid gap-7 sm:gap-6 xl:grid-cols-[1fr_0.8fr]">
      <DashboardPanel>
        <SectionHeader
          title="Templates & Resources"
          description={`Templates for ${getProjectStageLabel(currentStage)} stage.`}
          action={
            <Button variant="outline" onClick={onFetchTemplates}>
              {isFetchingTemplates ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <RefreshCcw size={16} />
              )}
              Load Word Templates
            </Button>
          }
        />

        <div className="space-y-3">
          {visibleTemplates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
              <FileText className="mx-auto mb-3 text-[var(--color-text-muted)]" size={32} />
              <p className="text-sm font-bold text-[var(--color-text)]">No templates loaded</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Load editable Word-format templates for the current project stage.
              </p>
            </div>
          ) : (
            visibleTemplates.map((template) => (
              <button
                key={template.id || template.filename}
                type="button"
                onClick={() => onOpenTemplate(template)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors hover:bg-[var(--color-surface-muted)]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[var(--color-text)]">
                    {template.title}
                  </p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">
                    {template.filename}
                  </p>
                </div>
                <ExternalLink size={16} className="shrink-0 text-[var(--color-text-muted)]" />
              </button>
            ))
          )}
        </div>
      </DashboardPanel>

      <DashboardPanel>
        <SectionHeader title="Academic Settings" description="Program and batch are reset-sensitive fields." />

        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
              Program
            </p>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">
              {currentProgramName}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
              Batch
            </p>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">
              {batch || 'No batch'}
            </p>
          </div>

          <Button variant="outline" className="w-full" onClick={onOpenAcademicEditor}>
            <Settings size={16} />
            Update Program / Batch
          </Button>
        </div>
      </DashboardPanel>
    </div>
  );
}
