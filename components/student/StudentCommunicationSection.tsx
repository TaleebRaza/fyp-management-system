import { LinkifiedText } from '../ui';
import type { AnnouncementItem } from './studentDashboardTypes';
import StudentMessageWidget from './StudentMessageWidget';

export default function StudentCommunicationSection({
  announcements,
  getSecureMediaUrl,
  isDarkMode,
  hasAssignedSupervisor,
  supervisorName,
}: {
  announcements: AnnouncementItem[];
  getSecureMediaUrl: (url?: string) => string;
  isDarkMode: boolean;
  hasAssignedSupervisor: boolean;
  supervisorName?: string;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
      <section>
        <h2 className="text-lg font-semibold">Announcements</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Updates from your supervisor and the portal.</p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {announcements.length ? announcements.map((item) => (
            <article key={item.id} className="border-b border-[var(--color-border)] p-4 last:border-0 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <span className="text-xs text-[var(--color-text-muted)]">{item.source}</span>
              </div>
              {item.type === 'audio'
                ? <audio controls src={getSecureMediaUrl(item.content)} className="mt-3 w-full" />
                : <p className="mt-2 text-sm font-bold leading-6 text-[var(--color-text)]"><LinkifiedText text={item.content} /></p>}
            </article>
          )) : <p className="p-5 text-sm text-[var(--color-text-muted)]">No announcements yet.</p>}
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Messages</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Contact an administrator or your assigned supervisor.</p>
        <div className="mt-4"><StudentMessageWidget embedded isDarkMode={isDarkMode} hasAssignedSupervisor={hasAssignedSupervisor} supervisorName={supervisorName} /></div>
      </section>
    </div>
  );
}
