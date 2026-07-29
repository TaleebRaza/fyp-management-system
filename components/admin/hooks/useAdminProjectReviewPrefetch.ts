import { useEffect } from 'react';
import { prefetchAdminProjectReviews } from '../api/adminDashboardApi';

export function useAdminProjectReviewPrefetch(
  loadPanel: () => Promise<unknown>
): void {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPanel();
      void prefetchAdminProjectReviews().catch(() => undefined);
    }, 750);

    return () => window.clearTimeout(timer);
  }, [loadPanel]);
}
