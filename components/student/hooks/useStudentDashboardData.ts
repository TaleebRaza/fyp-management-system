'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeProjectDomainIds } from '../../../config/projectDomains';
import {
  getStudentDashboard,
  getStudentHeadline,
  getStudentSupervisors,
} from '../api/studentDashboardApi';
import { createStudentProjectDraft } from '../draft/studentProjectDraft';
import type {
  AvailableSupervisor,
  StudentDashboardData,
  StudentDashboardProps,
} from '../studentDashboardTypes';
import type { StudentProjectDraft } from '../draft/studentProjectDraft';

type UseStudentDashboardDataOptions = {
  userId: string;
  restoreProjectDraft: (draft: StudentProjectDraft) => Promise<void>;
  showDialog: StudentDashboardProps['showDialog'];
};

function createServerDraft(data: StudentDashboardData): StudentProjectDraft | null {
  if (!data.student) return null;
  return createStudentProjectDraft({
    title: data.student.projectTitle,
    desc: data.student.projectDesc,
    domains: normalizeProjectDomainIds(
      Array.isArray(data.project?.domains) && data.project.domains.length > 0
        ? data.project.domains
        : data.student.domains,
      data.project?.domain || data.student.domain || ''
    ),
    legacyDomain: data.project?.domain || data.student.domain || '',
    tools: data.student.tools,
  });
}

export function useStudentDashboardData({
  userId,
  restoreProjectDraft,
  showDialog,
}: UseStudentDashboardDataOptions) {
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [supervisors, setSupervisors] = useState<AvailableSupervisor[]>([]);
  const [supervisorsLoaded, setSupervisorsLoaded] = useState(false);
  const [isLoadingSupervisors, setIsLoadingSupervisors] = useState(false);
  const [supervisorsError, setSupervisorsError] = useState(false);
  const supervisorRequest = useRef<Promise<void> | null>(null);
  const [headline, setHeadline] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const applyDashboard = useCallback(
    async (nextData: StudentDashboardData) => {
      setData(nextData);
      const serverDraft = createServerDraft(nextData);
      if (serverDraft) await restoreProjectDraft(serverDraft);
    },
    [restoreProjectDraft]
  );

  const refreshHeadline = useCallback(async () => {
    try {
      setHeadline(await getStudentHeadline());
    } catch (error) {
      console.error('Failed to fetch headline:', error);
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    try {
      await applyDashboard(await getStudentDashboard(userId));
    } catch (error) {
      console.error('Dashboard fetch error:', error);
      throw new Error('The dashboard refresh failed. Your change may already be saved; refresh before retrying.');
    } finally {
      setIsLoading(false);
    }
  }, [applyDashboard, userId]);

  const loadSupervisors = useCallback((): Promise<void> => {
    if (supervisorRequest.current) return supervisorRequest.current;
    setIsLoadingSupervisors(true);
    setSupervisorsError(false);
    const request = getStudentSupervisors()
      .then((value) => {
        setSupervisors(value);
        setSupervisorsLoaded(true);
      })
      .catch((error) => {
        setSupervisorsError(true);
        throw error;
      })
      .finally(() => {
        setIsLoadingSupervisors(false);
        supervisorRequest.current = null;
      });
    supervisorRequest.current = request;
    return request;
  }, []);

  const refreshSupervisors = useCallback(async () => {
    if (!supervisorsLoaded && !supervisorRequest.current) return;
    // Wait for a pre-mutation read before requesting current capacity.
    if (supervisorRequest.current) await supervisorRequest.current.catch(() => {});
    await loadSupervisors();
  }, [loadSupervisors, supervisorsLoaded]);

  useEffect(() => {
    let cancelled = false;

    const headlineRequest = getStudentHeadline()
      .then((value) => {
        if (!cancelled) setHeadline(value);
      })
      .catch((error) => console.error('Failed to fetch headline:', error));

    const dashboardRequest = userId
      ? getStudentDashboard(userId)
          .then(async (value) => {
            if (cancelled) return;
            await applyDashboard(value);
          })
          .catch((error) => {
            if (cancelled) return;
            console.error('Dashboard fetch error:', error);
            showDialog({
              title: 'Dashboard unavailable',
              message:
                'Unable to load your dashboard right now. Please refresh and try again.',
            });
          })
          .finally(() => {
            if (!cancelled) setIsLoading(false);
          })
      : Promise.resolve().then(() => {
          if (!cancelled) setIsLoading(false);
        });

    void Promise.allSettled([headlineRequest, dashboardRequest]);
    return () => {
      cancelled = true;
    };
  }, [applyDashboard, showDialog, userId]);

  return {
    data,
    supervisors,
    supervisorsLoaded,
    isLoadingSupervisors,
    supervisorsError,
    loadSupervisors,
    headline,
    isLoading,
    refreshHeadline,
    refreshDashboard,
    refreshSupervisors,
  };
}
