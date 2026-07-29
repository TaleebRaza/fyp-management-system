'use client';

import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { updateStudentSupervisor } from '../api/studentWorkflowApi';
import type {
  AvailableSupervisor,
  StudentDashboardProps,
  SupervisorOption,
} from '../studentDashboardTypes';

type UseStudentSupervisorActionsOptions = {
  userId: string;
  supervisors: AvailableSupervisor[];
  currentSupervisorId?: string;
  isChangeLocked: boolean;
  refreshDashboard: () => Promise<void>;
  refreshSupervisors: () => Promise<void>;
  resetProjectDraft: () => Promise<void>;
  resetTemplates: () => void;
  showDialog: StudentDashboardProps['showDialog'];
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useStudentSupervisorActions({
  userId,
  supervisors,
  currentSupervisorId,
  isChangeLocked,
  refreshDashboard,
  refreshSupervisors,
  resetProjectDraft,
  resetTemplates,
  showDialog,
}: UseStudentSupervisorActionsOptions) {
  const [selectedSupervisorId, setSelectedSupervisorId] = useState('');
  const [isSupervisorWarningOpen, setIsSupervisorWarningOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supervisorOptions = useMemo<SupervisorOption[]>(
    () =>
      supervisors
        .filter((supervisor) => !supervisor.isFull)
        .map((supervisor) => ({
          id: supervisor._id,
          label: `${supervisor.name} (${supervisor.filledSlots}/${supervisor.maxSlots} slots)`,
        })),
    [supervisors]
  );

  const supervisorChangeOptions = useMemo(
    () =>
      supervisorOptions.filter(
        (option) => String(option.id) !== String(currentSupervisorId || '')
      ),
    [currentSupervisorId, supervisorOptions]
  );

  const selectedSupervisorName =
    supervisors.find(
      (supervisor) => String(supervisor._id) === String(selectedSupervisorId)
    )?.name || 'the selected supervisor';

  const submitSupervisorRequest = useCallback(
    async (action: 'assignSupervisor' | 'changeSupervisor') => {
      setIsSubmitting(true);
      try {
        const response = await updateStudentSupervisor({
          action,
          id: userId,
          supervisorId: selectedSupervisorId,
        });

        setSelectedSupervisorId('');
        setIsSupervisorWarningOpen(false);

        if (action === 'changeSupervisor') {
          await resetProjectDraft();
          resetTemplates();
        }

        await refreshDashboard();
        await refreshSupervisors();
        showDialog({
          title: action === 'changeSupervisor' ? 'Supervisor changed' : 'Supervisor assigned',
          message:
            response.message ||
            (action === 'changeSupervisor'
              ? 'You have started fresh under the new supervisor.'
              : 'Your supervisor has been assigned.'),
        });
      } catch (error) {
        showDialog({
          title: action === 'changeSupervisor' ? 'Supervisor change failed' : 'Assignment failed',
          message: getErrorMessage(error, 'Unable to update supervisor right now.'),
        });
      } finally {
        setIsSubmitting(false);
      }
    }, [
      refreshDashboard,
      refreshSupervisors,
      resetProjectDraft,
      resetTemplates,
      selectedSupervisorId,
      showDialog,
      userId,
    ]
  );

  const handleAssignSupervisor = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedSupervisorId) {
        showDialog({
          title: 'Select supervisor',
          message: 'Choose an available supervisor before confirming.',
        });
        return;
      }
      await submitSupervisorRequest('assignSupervisor');
    }, [selectedSupervisorId, showDialog, submitSupervisorRequest]
  );

  const openSupervisorChangeDialog = useCallback(() => {
    if (isChangeLocked) {
      showDialog({
        title: 'Supervisor change locked',
        message:
          'This project has already moved past proposal approval. Ask your supervisor to use migration if a supervisor transfer is required.',
      });
      return;
    }
    setSelectedSupervisorId('');
    setIsSupervisorWarningOpen(true);
  }, [isChangeLocked, showDialog]);

  const closeSupervisorChangeDialog = useCallback(() => {
    if (isSubmitting) return;
    setSelectedSupervisorId('');
    setIsSupervisorWarningOpen(false);
  }, [isSubmitting]);

  const handleConfirmSupervisorChange = useCallback(async () => {
    if (!selectedSupervisorId) {
      showDialog({
        title: 'Select supervisor',
        message: 'Choose a new available supervisor before confirming the change.',
      });
      return;
    }
    await submitSupervisorRequest('changeSupervisor');
  }, [selectedSupervisorId, showDialog, submitSupervisorRequest]);

  return {
    selectedSupervisorId,
    setSelectedSupervisorId,
    isSupervisorWarningOpen,
    isSubmitting,
    supervisorOptions,
    supervisorChangeOptions,
    selectedSupervisorName,
    handleAssignSupervisor,
    openSupervisorChangeDialog,
    closeSupervisorChangeDialog,
    handleConfirmSupervisorChange,
  };
}
