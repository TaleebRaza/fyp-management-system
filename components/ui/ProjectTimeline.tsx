import { CheckCircle } from 'lucide-react';

import { PROJECT_STAGES, type ProjectStage } from '../../config/appSettings';
import { DashboardPanel, SectionHeader } from './SharedUI';

const STAGE_LABELS: Record<ProjectStage, string> = {
  PROPOSAL: 'Proposal',
  THESIS_DRAFT: 'Thesis Draft',
  FINAL_DELIVERABLES: 'Final Deliverables',
};

const stages = PROJECT_STAGES.map(id => ({ id, label: STAGE_LABELS[id] }));

export function ProjectTimeline({ currentStage, descriptionSuffix = 'current stage' }: { currentStage?: string; descriptionSuffix?: string }) {
  const currentIndex = Math.max(stages.findIndex(stage => stage.id === currentStage), 0);
  const progress = Math.round(((currentIndex + 1) / stages.length) * 100);

  return (
    <DashboardPanel>
      <SectionHeader title="Project Progress" description={`${progress}% complete based on the ${descriptionSuffix}.`} />
      <div className="portal-scrollbar overflow-x-auto">
        <div className="relative flex min-w-[560px] items-start justify-between gap-4 pb-2">
          <div className="absolute left-10 right-10 top-5 h-px bg-[var(--color-border)]" />
          {stages.map((stage, index) => {
            const isDone = index < currentIndex;
            const isActive = index === currentIndex;
            return (
              <div key={stage.id} className="relative z-10 flex flex-1 flex-col items-center text-center">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold ${isDone ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white' : isActive ? 'border-[var(--color-accent)] bg-[var(--color-surface)] text-[var(--color-accent)]' : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]'}`}>
                  {isDone ? <CheckCircle size={18} /> : index + 1}
                </div>
                <p className={`mt-3 text-sm font-semibold ${isActive || isDone ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}`}>{stage.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardPanel>
  );
}
