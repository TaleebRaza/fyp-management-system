import type { ProjectRatingsExportFilters } from '../../../config/projectRatings';
import type { ProjectRatingExportRow } from '../../../lib/projectRatingsExport';
import { PDF_CONTENT_WIDTH, PdfReport } from '../../reports/pdfReport';

type ProjectRatingsPdfInput = {
  rows: ProjectRatingExportRow[];
  filters: ProjectRatingsExportFilters;
};

function formatGeneratedAt(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function readableEnum(value: string) {
  const normalized = value.replace(/_/g, ' ').trim();
  return normalized || 'N/A';
}

function splitDomains(value: string) {
  const domains = value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return domains.length > 0 ? domains : ['N/A'];
}

function groupRowsByProject(rows: ProjectRatingExportRow[]) {
  const groups = new Map<string, ProjectRatingExportRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.projectId);
    if (existing) existing.push(row);
    else groups.set(row.projectId, [row]);
  }
  return [...groups.values()];
}

export async function buildProjectRatingsPdf({
  rows,
  filters,
}: ProjectRatingsPdfInput) {
  const groups = groupRowsByProject(rows);
  const roundLabel = filters.round === 'proposal' ? 'Proposal' : 'Thesis';
  const now = new Date();
  const report = await PdfReport.create(
    `${roundLabel} Project Ratings Report`,
    'Filtered project ratings and student details'
  );

  report.hero({
    eyebrow: 'FYP Management System',
    title: `${roundLabel} Project Ratings`,
    subtitle:
      'A structured, print-ready ratings report. Filtering is performed by the authenticated admin API; PDF rendering happens locally in the browser.',
    metadata: [
      { label: 'Rating Round', value: roundLabel },
      { label: 'Projects', value: String(groups.length) },
      { label: 'Student Rows', value: String(rows.length) },
      { label: 'Generated', value: formatGeneratedAt(now) },
    ],
  });
  report.summaryCards([
    { label: 'Min Project Idea', value: String(filters.minimums.projectIdea) },
    { label: 'Min Technical Merit', value: String(filters.minimums.technicalMerit) },
    {
      label: 'Min Documentation',
      value: String(filters.minimums.documentationQuality),
    },
    { label: 'Matching Students', value: String(rows.length) },
  ]);

  if (groups.length === 0) {
    report.sectionTitle('No projects matched these rating filters');
    report.text(
      'No rated projects currently satisfy all selected minimum scores. A minimum of zero means that category is not used as a threshold.',
      { color: 'muted', gapAfter: 8 }
    );
    return report.toBlob();
  }

  report.sectionTitle(
    'Rated Projects',
    'Each project is shown once, with shared ratings and supervisor details followed by the matching student rows.'
  );

  groups.forEach((projectRows, index) => {
    report.ensureSpace(250);
    const first = projectRows[0];
    report.projectHeader(
      index + 1,
      first.projectTitle || 'Untitled Project',
      `${first.ratingRound} | ${readableEnum(first.currentStage)} | ${readableEnum(first.currentStatus)}`
    );

    report.label('Domains');
    report.pills(splitDomains(first.domains));

    report.keyValueGrid([
      { label: 'Current Stage', value: readableEnum(first.currentStage) },
      { label: 'Current Status', value: readableEnum(first.currentStatus) },
      { label: 'Rating Round', value: first.ratingRound || roundLabel },
      { label: 'Supervisor Name', value: first.supervisorName || 'Unassigned' },
    ]);

    report.label('Ratings / 10');
    report.keyValueGrid(
      [
        { label: 'Project Idea', value: String(first.projectIdea) },
        { label: 'Technical Merit', value: String(first.technicalMerit) },
        {
          label: 'Documentation Quality',
          value: String(first.documentationQuality),
        },
      ],
      3
    );

    report.label('Students');
    report.table(
      [
        { label: 'Student Name', width: PDF_CONTENT_WIDTH * 0.29 },
        { label: 'Roll No', width: PDF_CONTENT_WIDTH * 0.19 },
        { label: 'Program', width: PDF_CONTENT_WIDTH * 0.15 },
        { label: 'Batch', width: PDF_CONTENT_WIDTH * 0.19 },
        { label: 'Semester', width: PDF_CONTENT_WIDTH * 0.18 },
      ],
      projectRows.map((row) => [
        row.studentName || 'N/A',
        row.studentRollNumber || 'N/A',
        row.studentProgram || 'N/A',
        row.studentBatch || 'N/A',
        row.studentSemester || 'N/A',
      ])
    );

    if (index < groups.length - 1) report.divider();
  });

  return report.toBlob();
}
