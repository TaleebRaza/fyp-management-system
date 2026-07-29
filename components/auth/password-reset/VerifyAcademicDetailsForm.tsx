'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { CheckCircle, Loader2, User } from 'lucide-react';

import { Select, StyledInput } from '../../ui/SharedUI';
import type { PasswordResetSupervisor } from './passwordResetTypes';

type VerifyAcademicDetailsFormProps = {
  rollNo: string;
  onRollNoChange: (value: string) => void;
  supervisorId: string;
  onSupervisorChange: (value: string) => void;
  batch: string;
  onBatchChange: (value: string) => void;
  program: string;
  onProgramChange: (value: string) => void;
  teammateRollNo: string;
  onTeammateRollNoChange: (value: string) => void;
  supervisors: PasswordResetSupervisor[];
  batchOptions: string[];
  programOptions: string[];
  isLoading: boolean;
  onSubmit: () => Promise<void>;
  onBack: () => void;
};

export function VerifyAcademicDetailsForm({
  rollNo,
  onRollNoChange,
  supervisorId,
  onSupervisorChange,
  batch,
  onBatchChange,
  program,
  onProgramChange,
  teammateRollNo,
  onTeammateRollNoChange,
  supervisors,
  batchOptions,
  programOptions,
  isLoading,
  onSubmit,
  onBack,
}: VerifyAcademicDetailsFormProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
          Student roll no / supervisor ID
        </label>
        <StyledInput
          icon={User}
          value={rollNo}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onRollNoChange(event.target.value)}
          required
          placeholder="e.g. F23-0201 or your supervisor ID"
          autoComplete="username"
        />
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          Supervisors need only their private ID. Students must complete the academic details below.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
          Supervisor
        </label>
        <Select
          value={supervisorId}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onSupervisorChange(event.target.value)}
        >
          <option value="">Select supervisor</option>
          <option value="none">No supervisor assigned</option>
          {supervisors.map((supervisor) => (
            <option key={supervisor._id} value={supervisor._id}>
              {supervisor.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
          Batch
        </label>
        <Select value={batch} onChange={(event: ChangeEvent<HTMLSelectElement>) => onBatchChange(event.target.value)}>
          <option value="">Select batch</option>
          {batchOptions.map((batchOption) => (
            <option key={batchOption} value={batchOption}>
              {batchOption}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
          Program
        </label>
        <Select value={program} onChange={(event: ChangeEvent<HTMLSelectElement>) => onProgramChange(event.target.value)}>
          <option value="">Select program</option>
          {programOptions.map((programOption) => (
            <option key={programOption} value={programOption}>
              {programOption}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
          Teammate roll no
        </label>
        <StyledInput
          value={teammateRollNo}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onTeammateRollNoChange(event.target.value)}
          placeholder="Required only if you have a teammate"
        />
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          Leave this blank only if you are not currently in a team.
        </p>
      </div>

      <button
        disabled={isLoading}
        type="submit"
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-55"
      >
        {isLoading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
        {isLoading ? 'Verifying details...' : 'Verify account details'}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="min-h-10 w-full rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-muted)]"
      >
        Back to login
      </button>
    </form>
  );
}
