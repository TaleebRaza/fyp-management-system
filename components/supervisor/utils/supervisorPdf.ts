import type { SupervisorProject } from '../supervisorDashboardTypes';
import { PDF_CONTENT_WIDTH, PdfReport } from '../../reports/pdfReport';

type SupervisorPdfInput = {
  projects: SupervisorProject[];
  supervisorName: string;
  batchFilter: string;
  programFilter: string;
};

type ExportMember = {
  name: string;
  rollNo: string;
  program: string;
  batch: string;
  semester: string;
};

type ExportProject = {
  project: SupervisorProject;
  members: ExportMember[];
};

function valueOrNA(value: unknown, fallback = 'N/A') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function formatGeneratedAt(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function splitTechnologies(value: unknown) {
  const technologies = String(value ?? '')
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return technologies.length > 0 ? technologies : ['N/A'];
}

function getFilteredProjects({
  projects,
  batchFilter,
  programFilter,
}: Pick<SupervisorPdfInput, 'projects' | 'batchFilter' | 'programFilter'>) {
  const expectedBatch = batchFilter === 'All' ? '' : batchFilter.trim();
  const expectedProgram = programFilter === 'All' ? '' : programFilter.trim();

  return projects.reduce<ExportProject[]>((result, project) => {
    const members = (project.members || [])
      .map<ExportMember>((member) => ({
        name: valueOrNA(member.name),
        rollNo: valueOrNA(member.rollNo),
        program: valueOrNA(member.program || project.program),
        batch: valueOrNA(member.batch || project.batch),
        semester: valueOrNA(member.semester || project.semester, '7th Semester'),
      }))
      .filter((member) => {
        const matchesBatch = !expectedBatch || member.batch === expectedBatch;
        const matchesProgram = !expectedProgram || member.program === expectedProgram;
        return matchesBatch && matchesProgram;
      })
      .sort((a, b) => a.rollNo.localeCompare(b.rollNo) || a.name.localeCompare(b.name));

    if (members.length > 0) result.push({ project, members });
    return result;
  }, []);
}

export async function buildSupervisorProjectsPdf(input: SupervisorPdfInput) {
  const filteredProjects = getFilteredProjects(input);
  const studentCount = filteredProjects.reduce(
    (total, project) => total + project.members.length,
    0
  );
  const now = new Date();
  const report = await PdfReport.create(
    'Supervisor Project Report',
    'Assigned FYP students and project details'
  );

  report.hero({
    eyebrow: 'FYP Management System',
    title: 'Supervisor Project Report',
    subtitle:
      'A clean, print-ready view of the same student and project information previously exported to Excel.',
    metadata: [
      { label: 'Supervisor', value: valueOrNA(input.supervisorName, 'Supervisor') },
      { label: 'Program', value: input.programFilter || 'All Programs' },
      { label: 'Batch', value: input.batchFilter || 'All Batches' },
      { label: 'Generated', value: formatGeneratedAt(now) },
    ],
  });
  report.summaryCards([
    { label: 'Projects', value: String(filteredProjects.length) },
    { label: 'Students', value: String(studentCount) },
    {
      label: 'Program Filter',
      value: input.programFilter && input.programFilter !== 'All'
        ? input.programFilter
        : 'All',
    },
    {
      label: 'Batch Filter',
      value: input.batchFilter && input.batchFilter !== 'All'
        ? input.batchFilter
        : 'All',
    },
  ]);

  if (filteredProjects.length === 0) {
    report.sectionTitle('No matching assigned students');
    report.text(
      'No assigned students match the selected program and batch filters. The report is intentionally empty rather than including unrelated records.',
      { color: 'muted', gapAfter: 8 }
    );
    return report.toBlob();
  }

  report.sectionTitle(
    'Assigned Projects',
    'Projects are grouped for readability; each team row retains the student-specific fields from the previous Excel export.'
  );

  filteredProjects.forEach(({ project, members }, index) => {
    report.ensureSpace(190);
    const programs = [...new Set(members.map((member) => member.program))].join(', ');
    const batches = [...new Set(members.map((member) => member.batch))].join(', ');
    const semesters = [...new Set(members.map((member) => member.semester))].join(', ');

    report.projectHeader(
      index + 1,
      valueOrNA(project.projectTitle, 'Untitled Project'),
      `${programs || 'N/A'} | ${batches || 'N/A'} | ${semesters || 'N/A'}`
    );
    report.label('Team');
    report.table(
      [
        { label: 'Name', width: PDF_CONTENT_WIDTH * 0.29 },
        { label: 'Roll No', width: PDF_CONTENT_WIDTH * 0.19 },
        { label: 'Program', width: PDF_CONTENT_WIDTH * 0.15 },
        { label: 'Batch', width: PDF_CONTENT_WIDTH * 0.19 },
        { label: 'Semester', width: PDF_CONTENT_WIDTH * 0.18 },
      ],
      members.map((member) => [
        member.name,
        member.rollNo,
        member.program,
        member.batch,
        member.semester,
      ])
    );
    report.label('Technologies');
    report.pills(splitTechnologies(project.tools));
    report.label('Project Description');
    report.text(valueOrNA(project.projectDesc), {
      size: 8.8,
      lineHeight: 12.5,
      gapAfter: 4,
    });
    if (index < filteredProjects.length - 1) report.divider();
  });

  return report.toBlob();
}
