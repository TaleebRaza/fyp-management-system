import { useCallback, useMemo, useState } from 'react';
import type { ShowDialog } from '../../../app/_components/PortalDialog';
import type { AdminReportsData } from '../adminDashboardTypes';
import type {
  ProjectRatingCategoryKey,
  ProjectRatingRound,
  ProjectRatingsExportFilters,
} from '../../../config/projectRatings';
import {
  buildCsv,
  buildReportHtml,
  downloadBlob,
  downloadTextFile,
  REPORT_OPTIONS,
  toReportRows,
  type ReportOption,
} from '../AdminReports';
import { getAdminReports, getProjectRatingsExport } from '../api/adminDashboardApi';

const DEFAULT_RATING_EXPORT_FILTERS: ProjectRatingsExportFilters = {
  round: 'proposal',
  minimums: { projectIdea: 0, technicalMerit: 0, documentationQuality: 0 },
};

export function useAdminReports(showDialog: ShowDialog) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<AdminReportsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] =
    useState<ReportOption['id']>('studentsPerSupervisor');
  const [ratingExportFilters, setRatingExportFilters] = useState(DEFAULT_RATING_EXPORT_FILTERS);
  const [isDownloadingRatings, setIsDownloadingRatings] = useState(false);

  const selectedReport = useMemo(
    () =>
      REPORT_OPTIONS.find((report) => report.id === selectedReportId) ||
      REPORT_OPTIONS[0],
    [selectedReportId]
  );

  const rows = useMemo(
    () => toReportRows(data, selectedReportId),
    [data, selectedReportId]
  );

  const refreshReports = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await getAdminReports());
    } catch (error) {
      console.error('Reports error:', error);
      showDialog({
        title: 'Reports unavailable',
        message:
          'Unable to load report data right now. Please refresh and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [showDialog]);

  const openReports = useCallback(async () => {
    setIsOpen(true);
    await refreshReports();
  }, [refreshReports]);

  const closeReports = useCallback(() => setIsOpen(false), []);

  const openReportInNewTab = useCallback(() => {
    if (!data) return;

    const html = buildReportHtml(data, selectedReport, rows);
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
      showDialog({
        title: 'Popup blocked',
        message:
          'Allow popups for this portal, then click Open Report again. The report is not downloaded or saved.',
      });
      return;
    }

    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
  }, [data, rows, selectedReport, showDialog]);

  const downloadHtmlReport = useCallback(() => {
    if (!data) return;
    const html = buildReportHtml(data, selectedReport, rows);
    downloadTextFile(html, `${selectedReport.id}-report.html`, 'text/html');
  }, [data, rows, selectedReport]);

  const downloadCsvReport = useCallback(() => {
    const csv = buildCsv(rows);
    downloadTextFile(csv, `${selectedReport.id}-report.csv`, 'text/csv');
  }, [rows, selectedReport.id]);

  const setRatingExportRound = useCallback((round: ProjectRatingRound) => {
    setRatingExportFilters((current) => ({ ...current, round }));
  }, []);

  const setRatingExportMinimum = useCallback(
    (category: ProjectRatingCategoryKey, value: number) => {
      setRatingExportFilters((current) => ({
        ...current,
        minimums: { ...current.minimums, [category]: value },
      }));
    },
    []
  );

  const downloadProjectRatings = useCallback(async () => {
    setIsDownloadingRatings(true);
    try {
      const { blob, filename } = await getProjectRatingsExport(ratingExportFilters);
      downloadBlob(blob, filename);
    } catch (error) {
      showDialog({
        title: 'Ratings export failed',
        message: error instanceof Error
          ? error.message
          : 'Unable to download project ratings right now.',
      });
    } finally {
      setIsDownloadingRatings(false);
    }
  }, [ratingExportFilters, showDialog]);

  return {
    isOpen,
    data,
    isLoading,
    selectedReportId,
    setSelectedReportId,
    selectedReport,
    rows,
    refreshReports,
    openReports,
    closeReports,
    openReportInNewTab,
    downloadHtmlReport,
    downloadCsvReport,
    ratingExportFilters,
    isDownloadingRatings,
    setRatingExportRound,
    setRatingExportMinimum,
    downloadProjectRatings,
  };
}
