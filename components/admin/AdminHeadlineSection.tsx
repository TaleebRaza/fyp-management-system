import type { FormEventHandler } from 'react';
import { Megaphone, Trash2 } from 'lucide-react';
import { Button, DashboardPanel, LinkifiedText, SectionHeader, StyledInput } from '../ui/SharedUI';

export default function AdminHeadlineSection({
  headlineInput,
  onHeadlineInputChange,
  currentHeadline,
  onBroadcast,
  onClear,
}: {
  headlineInput: string;
  onHeadlineInputChange: (value: string) => void;
  currentHeadline: string;
  onBroadcast: FormEventHandler<HTMLFormElement>;
  onClear: () => void;
}) {
  return (
    <DashboardPanel>
      <SectionHeader title="Announcement Center" description="Publish a headline announcement visible to students." />
      <form onSubmit={onBroadcast} className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <StyledInput
          value={headlineInput}
          onChange={(event) => onHeadlineInputChange(event.target.value)}
          placeholder="Write a concise portal announcement..."
        />
        <div className="grid gap-2 sm:grid-cols-2 lg:flex">
          <Button type="submit"><Megaphone size={16} />Broadcast</Button>
          <Button type="button" variant="outline" onClick={onClear}><Trash2 size={16} />Clear</Button>
        </div>
      </form>

      {currentHeadline ? (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Current announcement</p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text)]"><LinkifiedText text={currentHeadline} /></p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">No active announcement is currently published.</p>
      )}
    </DashboardPanel>
  );
}
