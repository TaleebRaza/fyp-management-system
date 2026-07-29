'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ShowDialog } from '../../../app/_components/PortalDialog';
import {
  completePasswordReset,
  loadPasswordResetSupervisors,
  verifyPasswordResetDetails,
} from './passwordResetApi';
import {
  buildPasswordResetBatchOptions,
  getPasswordResetProgramOptions,
} from './passwordResetOptions';
import type { PasswordResetStep, PasswordResetSupervisor } from './passwordResetTypes';

type UsePasswordResetFlowOptions = {
  showDialog: ShowDialog;
  onBack: () => void;
};

export function usePasswordResetFlow({ showDialog, onBack }: UsePasswordResetFlowOptions) {
  const [step, setStep] = useState<PasswordResetStep>('verify');
  const [rollNo, setRollNo] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [batch, setBatch] = useState('');
  const [program, setProgram] = useState('');
  const [teammateRollNo, setTeammateRollNo] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [supervisors, setSupervisors] = useState<PasswordResetSupervisor[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const batchOptions = useMemo(() => buildPasswordResetBatchOptions(), []);
  const programOptions = useMemo(() => getPasswordResetProgramOptions(), []);

  useEffect(() => {
    let cancelled = false;

    void loadPasswordResetSupervisors()
      .then((value) => {
        if (!cancelled) setSupervisors(value);
      })
      .catch((error) => console.error('Unable to load supervisors:', error));

    return () => {
      cancelled = true;
    };
  }, []);

  const verifyDetails = useCallback(async () => {
    const normalizedRollNo = rollNo.trim();
    const normalizedTeammateRollNo = teammateRollNo.trim();

    if (!normalizedRollNo || !supervisorId || !batch || !program) {
      showDialog({
        title: 'Account details required',
        message: 'Enter your roll number and select your supervisor, batch, and program.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await verifyPasswordResetDetails({
        rollNo: normalizedRollNo,
        supervisorId,
        batch,
        program,
        teammateRollNo: normalizedTeammateRollNo,
      });

      if (result.ok && result.resetToken) {
        setResetToken(result.resetToken);
        setStep('reset');
        showDialog({ title: 'Details verified', message: result.message });
        return;
      }

      showDialog({ title: 'Verification failed', message: result.message });
    } catch {
      showDialog({
        title: 'Connection error',
        message: 'Unable to verify your account details right now. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [batch, program, rollNo, showDialog, supervisorId, teammateRollNo]);

  const resetPassword = useCallback(async () => {
    const normalizedRollNo = rollNo.trim();

    if (!normalizedRollNo || !resetToken || !newPassword) {
      showDialog({
        title: 'Missing information',
        message: 'Verify your account details and enter a new password.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await completePasswordReset({
        rollNo: normalizedRollNo,
        resetToken,
        newPassword,
      });

      if (result.ok) {
        onBack();
        showDialog({ title: 'Password updated', message: result.message });
        return;
      }

      showDialog({ title: 'Password reset failed', message: result.message });
    } catch {
      showDialog({
        title: 'Connection error',
        message: 'Unable to reset your password right now. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [newPassword, onBack, resetToken, rollNo, showDialog]);

  const returnToVerification = useCallback(() => {
    setResetToken('');
    setNewPassword('');
    setStep('verify');
  }, []);

  return {
    step,
    rollNo,
    setRollNo,
    supervisorId,
    setSupervisorId,
    batch,
    setBatch,
    program,
    setProgram,
    teammateRollNo,
    setTeammateRollNo,
    newPassword,
    setNewPassword,
    supervisors,
    batchOptions,
    programOptions,
    isLoading,
    verifyDetails,
    resetPassword,
    returnToVerification,
  };
}
