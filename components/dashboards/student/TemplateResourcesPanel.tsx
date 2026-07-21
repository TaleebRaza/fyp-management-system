import { ExternalLink, FileText, Loader2, RefreshCcw } from 'lucide-react';

import { Button, DashboardPanel, SectionHeader } from '../../ui/SharedUI';

export type WordTemplate = {
  id: string;
  title: string;
  filename: string;
  format: 'word';
  content: string;
};

type TemplateResourcesPanelProps = {
  stageLabel: string;
  templates: WordTemplate[];
  isLoading: boolean;
  onLoad: () => void;
  onOpen: (template: WordTemplate) => void;
};

export function TemplateResourcesPanel({
  stageLabel,
  templates,
  isLoading,
  onLoad,
  onOpen,
}: TemplateResourcesPanelProps) {
  return (
    <DashboardPanel>
      <SectionHeader
        title="Templates & Resources"
        description={`Templates for ${stageLabel} stage.`}
        action={
          <Button variant="outline" onClick={onLoad}>
            {isLoading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
            Load Word Templates
          </Button>
        }
      />

      <div className="space-y-3">
        {templates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
            <FileText className="mx-auto mb-3 text-[var(--color-text-muted)]" size={32} />
            <p className="text-sm font-bold text-[var(--color-text)]">No templates loaded</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Load editable Word-format templates for the current project stage.
            </p>
          </div>
        ) : (
          templates.map((template) => (
            <button
              key={template.id || template.filename}
              type="button"
              onClick={() => onOpen(template)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors hover:bg-[var(--color-surface-muted)]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[var(--color-text)]">{template.title}</p>
                <p className="truncate text-xs text-[var(--color-text-muted)]">{template.filename}</p>
              </div>
              <ExternalLink size={16} className="shrink-0 text-[var(--color-text-muted)]" />
            </button>
          ))
        )}
      </div>
    </DashboardPanel>
  );
}
