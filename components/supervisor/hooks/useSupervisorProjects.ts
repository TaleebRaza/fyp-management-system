import { useCallback, useEffect, useState } from 'react';
import { loadSupervisorDashboard } from '../api/supervisorDashboardApi';
import type { SupervisorProject } from '../supervisorDashboardTypes';
import { getSupervisorErrorMessage } from '../utils/supervisorErrors';
import type { SupervisorNotify } from './useSupervisorFeedback';

export function useSupervisorProjects({
  supervisorId,
  notify,
}: {
  supervisorId: string;
  notify: SupervisorNotify;
}) {
  const [projects, setProjects] = useState<SupervisorProject[]>([]);
  const [migrationCode, setMigrationCode] = useState('Loading...');
  const [isLoading, setIsLoading] = useState(true);

  const refreshProjects = useCallback(async () => {
    try {
      if (!supervisorId) {
        throw new Error('Supervisor session is missing. Please sign in again.');
      }

      setIsLoading(true);
      const dashboard = await loadSupervisorDashboard();
      setProjects(dashboard.projects);
      setMigrationCode(dashboard.migrationCode);
    } catch (error) {
      console.error('Supervisor dashboard fetch error:', error);
      notify(
        'Dashboard unavailable',
        getSupervisorErrorMessage(
          error,
          'Unable to load supervisor dashboard right now. Please refresh and try again.'
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [notify, supervisorId]);

  useEffect(() => {
    void Promise.resolve().then(refreshProjects);
  }, [refreshProjects]);

  return {
    projects,
    migrationCode,
    isLoading,
    refreshProjects,
  };
}
