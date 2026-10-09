import { useCallback } from 'react';
import type { ShowDialog } from '../../../app/_components/PortalDialog';
import { updateAdminEmail } from '../api/adminDashboardApi';

type UseAdminEmailUpdateOptions = {
  showDialog: ShowDialog;
  studentPage: number;
  updateStudentEmailLocally: (userId: string, email: string) => void;
  updateSupervisorEmailLocally: (userId: string, email: string) => void;
  refreshStudents: (page?: number) => Promise<void>;
  refreshSupervisors: () => Promise<void>;
};

export function useAdminEmailUpdate({
  showDialog,
  studentPage,
  updateStudentEmailLocally,
  updateSupervisorEmailLocally,
  refreshStudents,
  refreshSupervisors,
}: UseAdminEmailUpdateOptions) {
  return useCallback(
    (userId: string, currentEmail: string, name: string, role: 'student' | 'supervisor') => {
      showDialog({
        type: 'prompt',
        inputType: 'email',
        title: 'Update email',
        message: `Enter a new email address for ${name}.`,
        defaultValue: currentEmail || '',
        onConfirm: async (newEmail = '') => {
          const cleanedEmail = String(newEmail || '').trim().toLowerCase();
          const cleanedCurrentEmail = String(currentEmail || '')
            .trim()
            .toLowerCase();

          if (!cleanedEmail || cleanedEmail === cleanedCurrentEmail) return;

          try {
            const result = await updateAdminEmail(userId, cleanedEmail);
            if (result.ok) {
              const updatedEmail =
                result.data.user?.email || result.data.email || cleanedEmail;

              if (role === 'student') updateStudentEmailLocally(userId, updatedEmail);
              else updateSupervisorEmailLocally(userId, updatedEmail);
              showDialog({
                title: 'Email updated',
                message:
                  result.data.message || 'The email address has been updated.',
              });
              if (role === 'student') await refreshStudents(studentPage);
              else await refreshSupervisors();
              return;
            }

            showDialog({
              title: 'Update failed',
              message: result.data.error || 'Failed to update email.',
            });
          } catch {
            showDialog({
              title: 'Connection error',
              message: 'Unable to update email right now.',
            });
          }
        },
      });
    },
    [
      refreshStudents,
      refreshSupervisors,
      showDialog,
      studentPage,
      updateStudentEmailLocally,
      updateSupervisorEmailLocally,
    ]
  );
}
