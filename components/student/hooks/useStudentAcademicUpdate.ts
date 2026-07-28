'use client';

import { useCallback, useMemo, useState } from 'react';
import { updateStudentAcademicInfo } from '../api/studentWorkflowApi';
import type { AcademicForm, StudentDashboardProps } from '../studentDashboardTypes';

type UseStudentAcademicUpdateOptions = {
  userId: string;
  currentProgram?: string;
  currentBatch?: string;
  refreshDashboard: () => Promise<void>;
  refreshSupervisors: () => Promise<void>;
  resetProjectDraft: () => Promise<void>;
  resetTemplates: () => void;
  showDialog: StudentDashboardProps['showDialog'];
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useStudentAcademicUpdate({
  userId,
  currentProgram,
  currentBatch,
  refreshDashboard,
  refreshSupervisors,
  resetProjectDraft,
  resetTemplates,
  showDialog,
}: UseStudentAcademicUpdateOptions) {
  const [isAcademicDialogOpen, setIsAcademicDialogOpen] = useState(false);
  const [isAcademicWarningStep, setIsAcademicWarningStep] = useState(false);
  const [isAcademicUpdating, setIsAcademicUpdating] = useState(false);
  const [academicForm, setAcademicForm] = useState<AcademicForm>({
    program: 'BSCS',
    batch: '',
  });

  const batchOptions = useMemo(() => {
    const options: string[] = [];
    const maxYear = new Date().getFullYear() + 1;
    for (let year = 2021; year <= maxYear; year++) {
      options.push(`Spring ${year}`);
      options.push(`Fall ${year}`);
    }
    return options;
  }, []);

  const openAcademicEditor = useCallback(() => {
    setAcademicForm({
      program: currentProgram || 'BSCS',
      batch: currentBatch || '',
    });
    setIsAcademicWarningStep(false);
    setIsAcademicDialogOpen(true);
  }, [currentBatch, currentProgram]);

  const closeAcademicEditor = useCallback(() => {
    setIsAcademicDialogOpen(false);
    setIsAcademicWarningStep(false);
  }, []);

  const handleAcademicUpdate = useCallback(async () => {
    if (!academicForm.program || !academicForm.batch) {
      showDialog({
        title: 'Missing academic details',
        message: 'Select both program and batch.',
      });
      return;
    }

    setIsAcademicUpdating(true);
    try {
      const response = await updateStudentAcademicInfo({
        id: userId,
        program: academicForm.program,
        batch: academicForm.batch,
      });
      closeAcademicEditor();
      await resetProjectDraft();
      resetTemplates();
      await refreshDashboard();
      await refreshSupervisors();
      showDialog({
        title: 'Academic info updated',
        message: response.message || 'Program and batch updated successfully.',
      });
    } catch (error) {
      showDialog({
        title: 'Update blocked',
        message: getErrorMessage(error, 'Could not update program and batch.'),
      });
    } finally {
      setIsAcademicUpdating(false);
    }
  }, [
    academicForm.batch,
    academicForm.program,
    closeAcademicEditor,
    refreshDashboard,
    refreshSupervisors,
    resetProjectDraft,
    resetTemplates,
    showDialog,
    userId,
  ]);

  return {
    isAcademicDialogOpen,
    isAcademicWarningStep,
    setIsAcademicWarningStep,
    isAcademicUpdating,
    academicForm,
    setAcademicForm,
    batchOptions,
    openAcademicEditor,
    closeAcademicEditor,
    handleAcademicUpdate,
  };
}
