import { useCallback } from 'react';
import type { ShowDialog } from '../../../app/_components/PortalDialog';

export type SupervisorNotify = (title: string, message: string) => void;
export type SupervisorConfirmationRequest = (
  title: string,
  message: string,
  onConfirm: () => Promise<void> | void,
  labels?: { confirmLabel?: string; cancelLabel?: string }
) => void;
export type SupervisorRemarksRequest = (
  title: string,
  message: string,
  onConfirm: (remarks: string) => Promise<void>
) => void;

export function useSupervisorFeedback(showDialog?: ShowDialog) {
  const notify = useCallback<SupervisorNotify>(
    (title, message) => {
      if (showDialog) {
        showDialog({ title, message });
        return;
      }

      window.alert(`${title}\n\n${message}`);
    },
    [showDialog]
  );

  const requestConfirmation = useCallback<SupervisorConfirmationRequest>(
    (title, message, onConfirm, labels) => {
      if (showDialog) {
        showDialog({
          type: 'confirm',
          title,
          message,
          onConfirm,
          ...labels,
        });
        return;
      }

      if (window.confirm(message)) {
        void onConfirm();
      }
    },
    [showDialog]
  );

  const requestRemarks = useCallback<SupervisorRemarksRequest>(
    (title, message, onConfirm) => {
      if (showDialog) {
        showDialog({
          type: 'prompt',
          title,
          message,
          placeholder: 'Write remarks for this team...',
          onConfirm: (value) => onConfirm(value || ''),
        });
        return;
      }

      const remarks = window.prompt(message, '');
      if (remarks !== null) {
        void onConfirm(remarks);
      }
    },
    [showDialog]
  );

  return {
    notify,
    requestConfirmation,
    requestRemarks,
  };
}
