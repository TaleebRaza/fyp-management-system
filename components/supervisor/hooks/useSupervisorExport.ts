import { useCallback, useState } from 'react';
import { fetchSupervisorExport } from '../api/supervisorDashboardApi';
import {
  downloadSupervisorBlob,
  getSupervisorExportFilename,
} from '../utils/supervisorDownload';
import { getSupervisorErrorMessage } from '../utils/supervisorErrors';
import type { SupervisorNotify } from './useSupervisorFeedback';

export function useSupervisorExport({
  supervisorId,
  supervisorName,
  batchFilter,
  programFilter,
  notify,
}: {
  supervisorId: string;
  supervisorName: string;
  batchFilter: string;
  programFilter: string;
  notify: SupervisorNotify;
}) {
  const [isExporting, setIsExporting] = useState(false);

  const exportProjects = useCallback(async () => {
    setIsExporting(true);
    try {
      const blob = await fetchSupervisorExport({
        supervisorId,
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
          'An unexpected error occurred during export.'
        )
      );
    } finally {
      setIsExporting(false);
    }
  }, [
    batchFilter,
    notify,
    programFilter,
    supervisorId,
    supervisorName,
  ]);

  return {
    isExporting,
    exportProjects,
  };
}
