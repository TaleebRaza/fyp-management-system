import { ExternalLink, FileText, Loader2, Pencil, RefreshCcw, Settings } from 'lucide-react';
import { Button } from '../ui';
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
  onOpenNameEditor,
}: {
  currentStage: string;
  isFetchingTemplates: boolean;
  onFetchTemplates: () => void;
  visibleTemplates: WordTemplate[];
  onOpenTemplate: (template: WordTemplate) => void;
  currentProgramName: string;
  batch?: string;
  onOpenAcademicEditor: () => void;
  onOpenNameEditor: () => void;
}) {
  return (
    <div className="portal-bento">
      <section className="portal-bento-tile p-5 md:col-span-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="portal-eyebrow">{getProjectStageLabel(currentStage)} templates</p>
            <h2 className="mt-1 text-lg font-black text-[var(--color-text)]">Document resources</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">Load only the templates relevant to your current stage.</p>
          </div>
          <Button variant="outline" onClick={onFetchTemplates}>
            {isFetchingTemplates ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
            Load templates
          </Button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {visibleTemplates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-7 text-center sm:col-span-2">
              <FileText className="mx-auto mb-3 text-[var(--color-text-muted)]" size={28} />
              <p className="text-sm font-extrabold text-[var(--color-text)]">No templates loaded</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">Load editable Word-format templates when you need them.</p>
            </div>
          ) : visibleTemplates.map((template) => (
            <button key={template.id || template.filename} type="button" onClick={() => onOpenTemplate(template)} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-left hover:bg-[var(--color-surface)]">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-[var(--color-text)]">{template.title}</p>
                <p className="truncate text-xs text-[var(--color-text-muted)]">{template.filename}</p>
              </div>
              <ExternalLink size={15} className="shrink-0 text-[var(--color-text-soft)]" />
            </button>
          ))}
        </div>
      </section>

      <section className="portal-bento-tile portal-bento-soft p-5 md:col-span-4">
        <p className="portal-eyebrow">Academic profile</p>
        <h2 className="mt-1 text-lg font-black text-[var(--color-text)]">{currentProgramName}</h2>
        <p className="mt-1 text-sm font-bold text-[var(--color-text-muted)]">{batch || 'No batch'}</p>
        <div className="mt-5 space-y-2">
          <Button variant="outline" className="w-full" onClick={onOpenNameEditor}><Pencil size={15} />Edit name</Button>
          <Button variant="outline" className="w-full" onClick={onOpenAcademicEditor}><Settings size={15} />Program / batch</Button>
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--color-text-muted)]">Academic changes can reset workflow data, so these controls stay out of the main dashboard.</p>
      </section>
    </div>
  );
}
