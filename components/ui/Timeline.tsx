import { CheckCircle } from 'lucide-react';
import { DashboardPanel, SectionHeader } from '.';

const PROJECT_STAGES = [
  { id: 'PROPOSAL', label: 'Proposal' },
  { id: 'THESIS_DRAFT', label: 'Thesis Draft' },
  { id: 'FINAL_DELIVERABLES', label: 'Final Deliverables' },
];

const getProjectStageIndex = (stage?: string) =>
  Math.max(
    PROJECT_STAGES.findIndex((item) => item.id === stage),
    0
  );

export const getProjectStageLabel = (stage?: string) =>
  PROJECT_STAGES.find((item) => item.id === stage)?.label || 'Proposal';

export const getProjectStageProgress = (stage?: string) =>
  Math.round(((getProjectStageIndex(stage) + 1) / PROJECT_STAGES.length) * 100);

export const Timeline = ({
  currentStage,
  descriptionSuffix,
}: {
  currentStage?: string;
  descriptionSuffix: string;
}) => {
  const currentIndex = getProjectStageIndex(currentStage);

  return (
    <DashboardPanel>
      <SectionHeader
        title="Project Progress"
        description={`${getProjectStageProgress(currentStage)}% complete ${descriptionSuffix}`}
      />

      <div className="portal-scrollbar overflow-x-auto">
        <div className="relative flex min-w-[560px] items-start justify-between gap-4 pb-2">
          <div className="absolute left-10 right-10 top-5 h-px bg-[var(--color-border)]" />

          {PROJECT_STAGES.map((stage, index) => {
            const isDone = index < currentIndex;
            const isActive = index === currentIndex;

            return (
              <div
                key={stage.id}
                className="relative z-10 flex flex-1 flex-col items-center text-center"
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold ${
                    isDone
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                      : isActive
                        ? 'border-[var(--color-accent)] bg-[var(--color-surface)] text-[var(--color-accent)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]'
                  }`}
                >
                  {isDone ? <CheckCircle size={18} /> : index + 1}
                </div>

                <p
                  className={`mt-3 text-sm font-semibold ${
                    isActive || isDone
                      ? 'text-[var(--color-text)]'
                      : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {stage.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardPanel>
  );
};
