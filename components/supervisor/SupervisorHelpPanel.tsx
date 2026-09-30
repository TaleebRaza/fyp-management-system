import { Dialog } from '../ui';

export type SupervisorHelpTopic = 'projects' | 'review' | 'ratings' | 'team' | 'viva' | 'communication';

const topics: { id: SupervisorHelpTopic; title: string; steps: string[] }[] = [
  {
    id: 'projects',
    title: 'Find and export projects',
    steps: ['Open Assigned Projects to see your teams.', 'Search by team, roll number, or project. Use the batch and program filters to narrow the list.', 'Open a project for its document, decision, and team details. Download PDF exports the current project summary.'],
  },
  {
    id: 'review',
    title: 'Review a submission',
    steps: ['Open Assigned Projects and choose a submission waiting for review.', 'Open the PDF and read the student work.', 'Choose Approve or Request changes, then add remarks for the team.'],
  },
  {
    id: 'ratings',
    title: 'Rate and progress a stage',
    steps: ['Approve the submitted document first.', 'Choose Progress stage when you are ready to move the team forward.', 'For Proposal and Thesis, score every category and save. Final deliverables complete the project.', 'To revise a saved rating, open the project Details view and use the rating review control.'],
  },
  {
    id: 'team',
    title: 'Manage a team',
    steps: ['Open an assigned project and select Team.', 'Allow a third member only when that team needs extra capacity.', 'To transfer a student, choose the student and enter the receiving supervisor’s migration code. Remove team clears the supervision link and requires confirmation.'],
  },
  {
    id: 'viva',
    title: 'Work with Viva sessions',
    steps: ['Open Viva Sessions to see your assigned sessions and schedule.', 'Only a panel admin can start a scheduled session or manage grading.', 'For a running session, select a final grade, save it, then complete the Viva. A start can be cancelled and moved last only before a grade is saved.'],
  },
  {
    id: 'communication',
    title: 'Message and broadcast',
    steps: ['Open Student Messages to read and reply to direct messages.', 'Use Broadcast to send an announcement to assigned students.', 'Choose text or voice, review the content, and publish when ready.'],
  },
];

export default function SupervisorHelpPanel({ open, topic, onClose }: { open: boolean; topic: SupervisorHelpTopic; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Supervisor help" description="Short guides for your work in the portal." size="sm">
      <div key={topic} className="space-y-2">
        {topics.map((item) => (
          <details key={item.id} open={item.id === topic} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{item.title}</summary>
            <ol className="space-y-3 border-t border-[var(--color-border)] px-4 py-4 text-sm leading-6 text-[var(--color-text-muted)]">
              {item.steps.map((step, index) => <li key={step} className="flex gap-3"><span className="font-semibold text-[var(--color-accent-ink)]">{index + 1}.</span><span>{step}</span></li>)}
            </ol>
          </details>
        ))}
      </div>
    </Dialog>
  );
}
