import { Pencil, Settings } from 'lucide-react';
import StudentEmailChange from './StudentEmailChange';
import { Button } from '../ui';
import type { StudentDashboardProps } from './studentDashboardTypes';

export default function StudentProfileSection({
  name, email, currentProgramName, batch, academicChangesLocked, onOpenAcademicEditor, onOpenNameEditor, showDialog,
}: {
  name?: string;
  email?: string;
  currentProgramName: string;
  batch?: string;
  academicChangesLocked: boolean;
  onOpenAcademicEditor: () => void;
  onOpenNameEditor: () => void;
  showDialog: StudentDashboardProps['showDialog'];
}) {
  return (
    <section className="portal-bento-tile mx-auto max-w-2xl p-5">
      <p className="portal-eyebrow">Your account</p>
      <h2 className="mt-1 text-lg font-black text-[var(--color-text)]">Profile</h2>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-[var(--color-text-muted)]">Name</dt><dd className="mt-1 break-words font-semibold">{name || 'Not set'}</dd></div>
        <div><dt className="text-[var(--color-text-muted)]">Email</dt><dd className="mt-1 break-all font-semibold">{email || 'Not set'}</dd></div>
        <div><dt className="text-[var(--color-text-muted)]">Program</dt><dd className="mt-1 font-semibold">{currentProgramName}</dd></div>
        <div><dt className="text-[var(--color-text-muted)]">Batch</dt><dd className="mt-1 font-semibold">{batch || 'Not set'}</dd></div>
      </dl>
      <div className="mt-5 space-y-2">
        <StudentEmailChange currentEmail={email} showDialog={showDialog} />
        <Button variant="outline" className="w-full" onClick={onOpenNameEditor}><Pencil size={15} />Edit name</Button>
        <Button variant="outline" className="w-full" disabled={academicChangesLocked} onClick={onOpenAcademicEditor}><Settings size={15} />Program / batch</Button>
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--color-text-muted)]">Existing verification and change limits apply. Changing program or batch can reset your project and team assignment.</p>
    </section>
  );
}
