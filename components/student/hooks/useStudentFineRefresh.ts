'use client';

import { useEffect } from 'react';

type UseStudentFineRefreshOptions = {
  isFineRestricted: boolean;
  refreshDashboard: () => Promise<void>;
};

export function useStudentFineRefresh({
  isFineRestricted,
  refreshDashboard,
}: UseStudentFineRefreshOptions): void {
  useEffect(() => {
    if (!isFineRestricted) return;

    const refreshFineStatus = () => {
      if (document.visibilityState === 'visible') {
        void refreshDashboard();
      }
    };

    document.addEventListener('visibilitychange', refreshFineStatus);
    return () => document.removeEventListener('visibilitychange', refreshFineStatus);
  }, [isFineRestricted, refreshDashboard]);
}
