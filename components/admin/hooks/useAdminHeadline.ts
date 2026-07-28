import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { ShowDialog } from '../../../app/_components/PortalDialog';
import {
  getAdminHeadline,
  publishAdminHeadline,
} from '../api/adminDashboardApi';

export function useAdminHeadline(showDialog: ShowDialog) {
  const [headlineInput, setHeadlineInput] = useState('');
  const [currentHeadline, setCurrentHeadline] = useState('');

  const refreshHeadline = useCallback(async () => {
    try {
      setCurrentHeadline(await getAdminHeadline());
    } catch (error) {
      console.error('Headline fetch error:', error);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    getAdminHeadline()
      .then((headline) => {
        if (!ignore) setCurrentHeadline(headline);
      })
      .catch((error) => {
        if (!ignore) console.error('Headline fetch error:', error);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const broadcastHeadline = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const text = headlineInput.trim();
      if (!text) {
        showDialog({
          title: 'Announcement required',
          message: 'Write an announcement before broadcasting it to students.',
        });
        return;
      }

      try {
        const result = await publishAdminHeadline(text);
        if (result.ok) {
          showDialog({
            title: 'Announcement published',
            message:
              String(result.data.message || '') ||
              'The headline announcement has been published.',
          });
          setHeadlineInput('');
          await refreshHeadline();
          return;
        }

        showDialog({
          title: 'Announcement failed',
          message:
            String(result.data.error || '') ||
            'Failed to update the headline announcement.',
        });
      } catch {
        showDialog({
          title: 'Connection error',
          message: 'Unable to publish the announcement right now.',
        });
      }
    },
    [headlineInput, refreshHeadline, showDialog]
  );

  const clearHeadline = useCallback(async () => {
    try {
      const result = await publishAdminHeadline('');
      if (result.ok) {
        showDialog({
          title: 'Announcement cleared',
          message:
            String(result.data.message || '') ||
            'The headline announcement has been removed.',
        });
        await refreshHeadline();
        return;
      }

      showDialog({
        title: 'Clear failed',
        message:
          String(result.data.error || '') ||
          'Failed to clear the headline announcement.',
      });
    } catch {
      showDialog({
        title: 'Connection error',
        message: 'Unable to clear the announcement right now.',
      });
    }
  }, [refreshHeadline, showDialog]);

  return {
    headlineInput,
    setHeadlineInput,
    currentHeadline,
    broadcastHeadline,
    clearHeadline,
  };
}
