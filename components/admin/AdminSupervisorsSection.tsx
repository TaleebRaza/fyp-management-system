import type { FormEventHandler } from 'react';
import { Loader2, Mail, MailX, PlusCircle, Search, Trash2, Users } from 'lucide-react';
import { APP_SETTINGS } from '../../config/appSettings';
import { MAX_EXTRA_SUPERVISOR_SLOTS } from '../../lib/supervisorSlots';
import { AvatarBadge, Badge, Button, DashboardPanel, Dialog, SectionHeader, StyledInput } from '../ui/SharedUI';
import type { AdminSupervisor } from './adminDashboardTypes';

export default function AdminSupervisorsSection({
  newSupervisor,
  onNewSupervisorChange,
  onAddSupervisor,
  supervisors,
  totalSupervisors,
  search,
  onSearchChange,
  onUpdateEmail,
  onEditSlots,
  onToggleNotifications,
  onDelete,
}: {
  newSupervisor: { name: string; rollNo: string; email: string; password: string };
  onNewSupervisorChange: (field: 'name' | 'rollNo' | 'email' | 'password', value: string) => void;
  onAddSupervisor: FormEventHandler<HTMLFormElement>;
  supervisors: AdminSupervisor[];
  totalSupervisors: number;
  search: string;
  onSearchChange: (value: string) => void;
  onUpdateEmail: (id: string, email: string, name: string) => void;
  onEditSlots: (supervisor: AdminSupervisor) => void;
  onToggleNotifications: (id: string, enabled: boolean) => void;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <div className="grid gap-7 sm:gap-6 xl:h-full xl:min-h-0 xl:grid-cols-[0.8fr_1.2fr]">
      <DashboardPanel className="h-fit xl:sticky xl:top-0">
        <SectionHeader title="Add Supervisor" description="Create a supervisor account with login credentials." />
        <form onSubmit={onAddSupervisor} className="space-y-4">
          <StyledInput value={newSupervisor.name} onChange={(event) => onNewSupervisorChange('name', event.target.value)} type="text" required placeholder="Full name" />
          <StyledInput value={newSupervisor.rollNo} onChange={(event) => onNewSupervisorChange('rollNo', event.target.value)} type="text" required placeholder="Username ID" />
          <StyledInput value={newSupervisor.email} onChange={(event) => onNewSupervisorChange('email', event.target.value)} type="email" required placeholder="Supervisor email" />
          <StyledInput value={newSupervisor.password} onChange={(event) => onNewSupervisorChange('password', event.target.value)} type="text" required placeholder="Assign password" />
          <Button type="submit" className="w-full"><PlusCircle size={16} />Create Account</Button>
        </form>
      </DashboardPanel>

      <DashboardPanel className="flex flex-col xl:h-full xl:min-h-0 xl:overflow-hidden">
        <div className="shrink-0">
          <SectionHeader
            title="Active Supervisors"
            description={`${supervisors.length}${search.trim() ? ` of ${totalSupervisors}` : ''} supervisor accounts`}
          />
          <StyledInput icon={Search} value={search} onChange={(event) => onSearchChange(event.target.value)} type="search" placeholder="Search by name, ID, email, or migration code..." />
        </div>

        <div className="portal-scrollbar mt-5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
          {supervisors.length === 0 ? (
            <div className="flex min-h-60 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
              <Users className="mb-3 text-[var(--color-text-muted)]" size={28} />
              <p className="text-sm font-semibold text-[var(--color-text)]">No supervisors found</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">Try another search term or create a new supervisor account.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {supervisors.map((supervisor) => {
                const filledSlots = Math.max(Number(supervisor.filledSlots || 0), 0);
                const extraSlots = Math.min(Math.max(Number(supervisor.extraSlots || 0), 0), MAX_EXTRA_SUPERVISOR_SLOTS);
                const maxSlots = Math.max(Number(supervisor.maxSlots || APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR), APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR);

                return (
                  <div key={supervisor._id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <AvatarBadge name={supervisor.name} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-[var(--color-text)]">{supervisor.name}</h3>
                            <Badge variant="muted">{supervisor.rollNo || 'No ID'}</Badge>
                            {supervisor.capacityReady === false ? <Badge variant="warning">Capacity reconciliation needed</Badge> : null}
                            {supervisor.isFull ? <Badge variant="danger">Full</Badge> : null}
                          </div>
                          <button type="button" onClick={() => onUpdateEmail(supervisor._id, supervisor.email || '', supervisor.name)} className="mt-1 break-all text-left text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
                            {supervisor.email || 'Assign email'}
                          </button>
                          <p className="mt-2 text-xs font-semibold text-[var(--color-text-muted)]">Migration Code:{' '}<span className="font-mono text-[var(--color-text)]">{supervisor.migrationCode || 'N/A'}</span></p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => onEditSlots(supervisor)} title={`Edit extra slots. Current usage: ${filledSlots} / ${maxSlots}`}>
                          <PlusCircle size={16} />Extra Slots: {extraSlots}/{MAX_EXTRA_SUPERVISOR_SLOTS}
                        </Button>
                        <Button variant="outline" onClick={() => onToggleNotifications(supervisor._id, Boolean(supervisor.notificationsEnabled))} title="Toggle notifications">
                          {supervisor.notificationsEnabled ? <Mail size={16} /> : <MailX size={16} />}
                          {supervisor.notificationsEnabled ? 'Notifications On' : 'Notifications Off'}
                        </Button>
                        <Button variant="danger" onClick={() => onDelete(supervisor._id, supervisor.name)}><Trash2 size={16} />Delete</Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DashboardPanel>
    </div>
  );
}

export function SupervisorSlotEditorDialog({
  supervisor,
  value,
  onValueChange,
  isSaving,
  onClose,
  onSave,
}: {
  supervisor: AdminSupervisor | null;
  value: string;
  onValueChange: (value: string) => void;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog
      open={Boolean(supervisor)}
      onClose={onClose}
      title="Edit Extra Slots"
      description={supervisor ? `Set total extra slots for ${supervisor.name}. Default capacity stays ${APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR}.` : undefined}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={onSave} disabled={isSaving}>{isSaving ? <Loader2 className="animate-spin" size={16} /> : null}Save Slots</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm leading-6 text-[var(--color-text-muted)]">
          Enter total extra slots from 0 to {MAX_EXTRA_SUPERVISOR_SLOTS}. For example, if current extra slots are 4, the maximum future increase is 6.
        </div>
        <div>
          <label className="mb-2 block text-sm font-bold text-[var(--color-text)]">Extra Slots</label>
          <input autoFocus type="number" min={0} max={MAX_EXTRA_SUPERVISOR_SLOTS} step={1} value={value} onChange={(event) => onValueChange(event.target.value)} className="h-11 w-24 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-center text-sm font-black text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]" />
          <p className="mt-2 text-xs font-semibold text-[var(--color-text-muted)]">Allowed range: 0 to {MAX_EXTRA_SUPERVISOR_SLOTS}</p>
        </div>
      </div>
    </Dialog>
  );
}
