import { useEffect } from 'react';

export function useAdminProjectReviewPrefetch(
  loadPanel: () => Promise<unknown>
): void {
  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);
}
