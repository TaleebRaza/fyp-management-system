'use client';

import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import {
  submitStudentProject,
  uploadStudentPdf,
} from '../api/studentDashboardApi';
import type { StudentDashboardProps } from '../studentDashboardTypes';
import { PROJECT_SUBMISSIONS_CLOSED_MESSAGE } from '../../../lib/projectSubmissionPolicy';

type UseStudentProjectSubmissionOptions = {
  userId: string;
  title: string;
  description: string;
  selectedDomains: string[];
  tools: string;
  file: File | null;
  existingPdfUrl?: string;
  status?: string;
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
  status,
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
  const canSubmitByStatus = ['Pending', 'Rejected', 'Changes Requested'].includes(
    status || ''
  );

  const handleSubmitProject = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

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
      if (!canSubmitByStatus) {
        showDialog({
          title: 'Submission closed',
          message: `Submissions are closed while your project status is ${status}.`,
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
      canSubmitByStatus,
      clearStoredProjectDraft,
      description,
      existingPdfUrl,
      file,
      isFineRestricted,
      isOwnFineRestricted,
      openFineTab,
      projectSubmissionsOpen,
      refreshDashboard,
      selectedDomains,
      showDialog,
      status,
      teamFineMessage,
      title,
      tools,
      userId,
    ]
  );

  return { isSubmitting, handleSubmitProject };
}
