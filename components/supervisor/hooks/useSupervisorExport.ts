import { useCallback, useState } from 'react';
import type { SupervisorProject } from '../supervisorDashboardTypes';
import {
  downloadSupervisorBlob,
  getSupervisorExportFilename,
} from '../utils/supervisorDownload';
import { getSupervisorErrorMessage } from '../utils/supervisorErrors';
import type { SupervisorNotify } from './useSupervisorFeedback';

export function useSupervisorExport({
  projects,
  supervisorName,
  batchFilter,
  programFilter,
  notify,
}: {
  projects: SupervisorProject[];
  supervisorName: string;
  batchFilter: string;
  programFilter: string;
  notify: SupervisorNotify;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const exportProjects = useCallback(async () => {
    setIsExporting(true);
    try {
      const { buildSupervisorProjectsPdf } = await import(
        '../utils/supervisorPdf'
      );
      const blob = await buildSupervisorProjectsPdf({
        projects,
        supervisorName,
        batchFilter,
        programFilter,
      });
      downloadSupervisorBlob(
        blob,
        getSupervisorExportFilename(supervisorName)
      );
    } catch (error) {
      notify(
        'Export failed',
        getSupervisorErrorMessage(
          error,
          'An unexpected error occurred during PDF export.'
        )
      );
    } finally {
      setIsExporting(false);
    }
  }, [batchFilter, notify, programFilter, projects, supervisorName]);

  return {
    isExporting,
    exportProjects,
  };
}
