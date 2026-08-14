'use client';

import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import {
  submitStudentProject,
  uploadStudentPdf,
} from '../api/studentDashboardApi';
import type { StudentDashboardProps } from '../studentDashboardTypes';
import {
  PROJECT_COMPLETE_MESSAGE,
  PROJECT_SUBMISSIONS_CLOSED_MESSAGE,
} from '../../../lib/projectSubmissionPolicy';

type UseStudentProjectSubmissionOptions = {
  userId: string;
  title: string;
  description: string;
  selectedDomains: string[];
  tools: string;
  file: File | null;
  existingPdfUrl?: string;
  hasAssignedSupervisor: boolean;
  projectSubmissionComplete: boolean;
  projectSubmissionsOpen: boolean;
  isFineRestricted: boolean;
  isOwnFineRestricted: boolean;
  teamFineMessage: string;
  clearStoredProjectDraft: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
  openFineTab: () => void;
  showDialog: StudentDashboardProps['showDialog'];
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useStudentProjectSubmission({
  userId,
  title,
  description,
  selectedDomains,
  tools,
  file,
  existingPdfUrl,
  hasAssignedSupervisor,
  projectSubmissionComplete,
  projectSubmissionsOpen,
  isFineRestricted,
  isOwnFineRestricted,
  teamFineMessage,
  clearStoredProjectDraft,
  refreshDashboard,
  openFineTab,
  showDialog,
}: UseStudentProjectSubmissionOptions) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitProject = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (projectSubmissionComplete) {
        showDialog({
          title: 'Project complete',
          message: PROJECT_COMPLETE_MESSAGE,
        });
        return;
      }
      if (!hasAssignedSupervisor) {
        showDialog({
          title: 'Supervisor required',
          message: 'Assign a supervisor before submitting your project.',
        });
        return;
      }
      if (!projectSubmissionsOpen) {
        showDialog({
          title: 'Submissions closed',
          message: PROJECT_SUBMISSIONS_CLOSED_MESSAGE,
        });
        return;
      }
      if (isFineRestricted) {
        if (isOwnFineRestricted) openFineTab();
        showDialog({
          title: isOwnFineRestricted ? 'Fine payment required' : 'Team fine pending',
          message: teamFineMessage,
        });
        return;
      }
      if (
        !title.trim() ||
        !description.trim() ||
        selectedDomains.length === 0 ||
        !tools.trim()
      ) {
        showDialog({
          title: 'Missing project details',
          message:
            'Complete the title, description, project domains, and tools before submitting.',
        });
        return;
      }
      if (!file && !existingPdfUrl) {
        showDialog({
          title: 'PDF required',
          message: 'Attach your project document as a PDF before submitting.',
        });
        return;
      }

      setIsSubmitting(true);
      try {
        const upload = file
          ? await uploadStudentPdf(file)
          : { url: existingPdfUrl, fileSize: 0 };
        const response = await submitStudentProject({
          id: userId,
          title: title.trim(),
          desc: description.trim(),
          domains: selectedDomains,
          tools: tools.trim(),
          pdfUrl: upload.url,
          fileSize: upload.fileSize,
        });
        await clearStoredProjectDraft();
        await refreshDashboard();
        showDialog({
          title: 'Project submitted',
          message:
            response.message ||
            'Your project has been submitted for supervisor review.',
        });
      } catch (error) {
        showDialog({
          title: 'Submission failed',
          message: getErrorMessage(error, 'Unable to submit project right now.'),
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      clearStoredProjectDraft,
      description,
      existingPdfUrl,
      file,
      hasAssignedSupervisor,
      isFineRestricted,
      isOwnFineRestricted,
      openFineTab,
      projectSubmissionComplete,
      projectSubmissionsOpen,
      refreshDashboard,
      selectedDomains,
      showDialog,
      teamFineMessage,
      title,
      tools,
      userId,
    ]
  );

  return { isSubmitting, handleSubmitProject };
}
