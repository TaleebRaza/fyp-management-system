'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { joinStudentTeam, leaveStudentTeam } from '../api/studentWorkflowApi';
import type { StudentDashboardProps } from '../studentDashboardTypes';

type UseStudentTeamActionsOptions = {
  inviteCode?: string;
  canLeaveTeam: boolean;
  refreshDashboard: () => Promise<void>;
  refreshSupervisors: () => Promise<void>;
  resetProjectDraft: () => Promise<void>;
  resetTemplates: () => void;
  showDialog: StudentDashboardProps['showDialog'];
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useStudentTeamActions({
  inviteCode,
  canLeaveTeam,
  refreshDashboard,
  refreshSupervisors,
  resetProjectDraft,
  resetTemplates,
  showDialog,
}: UseStudentTeamActionsOptions) {
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleJoinTeam = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const normalizedInviteCode = inviteCodeInput.trim().toUpperCase();
      if (!normalizedInviteCode) {
        showDialog({
          title: 'Invite code required',
          message: 'Enter a valid team invite code.',
        });
        return;
      }

      setIsSubmitting(true);
      try {
        const response = await joinStudentTeam(normalizedInviteCode);
        setInviteCodeInput('');
        await refreshDashboard();
        showDialog({
          title: 'Team joined',
          message: response.message || 'You have joined the team successfully.',
        });
      } catch (error) {
        showDialog({
          title: 'Join failed',
          message: getErrorMessage(error, 'Unable to join the team right now.'),
        });
      } finally {
        setIsSubmitting(false);
      }
    }, [inviteCodeInput, refreshDashboard, showDialog]
  );

  const performLeaveTeam = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const response = await leaveStudentTeam();
      await resetProjectDraft();
      setInviteCodeInput('');
      resetTemplates();
      await refreshDashboard();
      await refreshSupervisors();
      showDialog({
        title: 'Team left',
        message:
          response.message ||
          'You left the team successfully. A new project and invite code have been created for you.',
      });
    } catch (error) {
      showDialog({
        title: 'Leave team failed',
        message: getErrorMessage(error, 'Unable to leave the team right now.'),
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    refreshDashboard,
    refreshSupervisors,
    resetProjectDraft,
    resetTemplates,
    showDialog,
  ]);

  const handleLeaveTeam = useCallback(() => {
    if (!canLeaveTeam) {
      showDialog({
        title: 'Cannot leave team',
        message: 'You cannot leave because you are the only member of this team.',
      });
      return;
    }
    showDialog({
      type: 'confirm',
      title: 'Leave current team?',
      message:
        'You will lose this team’s supervisor, project status, project details, and PDF link. A completely new project and invite code will be created for you. This action cannot be undone.',
      onConfirm: performLeaveTeam,
    });
  }, [canLeaveTeam, performLeaveTeam, showDialog]);

  const handleCopyInviteCode = useCallback(async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    showDialog({
      title: 'Copied',
      message: 'Team invite code copied to clipboard.',
    });
  }, [inviteCode, showDialog]);

  return {
    inviteCodeInput,
    setInviteCodeInput,
    isSubmitting,
    handleJoinTeam,
    handleLeaveTeam,
    handleCopyInviteCode,
  };
}
