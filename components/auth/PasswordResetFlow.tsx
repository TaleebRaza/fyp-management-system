'use client';

import { Lock } from 'lucide-react';

import type { ShowDialog } from '../../app/_components/PortalDialog';
import { Card } from '../ui';
import { SetNewPasswordForm } from './password-reset/SetNewPasswordForm';
import { VerifyAcademicDetailsForm } from './password-reset/VerifyAcademicDetailsForm';
import { usePasswordResetFlow } from './password-reset/usePasswordResetFlow';

export default function PasswordResetFlow({
  showDialog,
  onBack,
}: {
  showDialog: ShowDialog;
  onBack: () => void;
}) {
  const flow = usePasswordResetFlow({ showDialog, onBack });

  return (
    <Card className="w-full p-0">
      <div className="border-b border-[var(--color-border)] px-5 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
            <Lock size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
              {flow.step === 'verify' ? 'Recover your account' : 'Set a new password'}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Account recovery</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--color-text-muted)]">
          {flow.step === 'verify'
            ? 'Students verify their academic details. Supervisors enter their private ID.'
            : 'Your account details are verified. Choose a new password.'}
        </p>
      </div>

      <div className="px-5 py-5 sm:px-6">
        {flow.step === 'verify' ? (
          <VerifyAcademicDetailsForm
            rollNo={flow.rollNo}
            onRollNoChange={flow.setRollNo}
            supervisorId={flow.supervisorId}
            onSupervisorChange={flow.setSupervisorId}
            batch={flow.batch}
            onBatchChange={flow.setBatch}
            program={flow.program}
            onProgramChange={flow.setProgram}
            teammateRollNo={flow.teammateRollNo}
            onTeammateRollNoChange={flow.setTeammateRollNo}
            supervisors={flow.supervisors}
            batchOptions={flow.batchOptions}
            programOptions={flow.programOptions}
            isLoading={flow.isLoading}
            onSubmit={flow.verifyDetails}
            onBack={onBack}
          />
        ) : (
          <SetNewPasswordForm
            rollNo={flow.rollNo}
            newPassword={flow.newPassword}
            onNewPasswordChange={flow.setNewPassword}
            isLoading={flow.isLoading}
            onSubmit={flow.resetPassword}
            onReturnToVerification={flow.returnToVerification}
          />
        )}
      </div>
    </Card>
  );
}
