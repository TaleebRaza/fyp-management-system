import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const {
  filterSupervisorProjects,
  getSupervisorDashboardStats,
  getUniqueSupervisorBatches,
  getUniqueSupervisorPrograms,
} = await importTypeScriptModule(
  'components/supervisor/supervisorProjectSelectors.ts'
);

const projects = [
  {
    _id: 'project-1',
    triggerStudentId: 'student-1',
    members: [
      { name: 'Ali Khan', rollNo: 'F23-0101', program: 'BSCS' },
      { name: 'Sara Noor', rollNo: 'F23-0102', program: 'BSCS' },
    ],
    program: 'BSCS',
    batch: 'Fall 2023',
    semester: '8th',
    projectTitle: 'Secure Student Portal',
    domain: 'cyber-security',
    domains: ['web-security'],
    tools: 'Next.js, MongoDB',
    status: 'Pending',
    stage: 'THESIS_DRAFT',
    pdfUrl: 'https://files.test/proposal.pdf',
  },
  {
    _id: 'project-2',
    triggerStudentId: 'student-2',
    members: [{ name: 'Zoya Ahmed', rollNo: 'F22-0201', program: 'BSAI' }],
    program: 'BSAI',
    batch: 'Fall 2022',
    semester: '8th',
    projectTitle: 'Vision Assistant',
    domain: 'computer-vision',
    tools: 'Python',
    status: 'Approved',
    pdfUrl: 'https://files.test/final.pdf',
  },
  {
    _id: 'project-3',
    triggerStudentId: 'student-3',
    members: [{ name: 'Hamza Iqbal', rollNo: 'F23-0301', program: 'CUSTOM' }],
    program: 'CUSTOM',
    batch: 'Fall 2023',
    semester: '7th',
    projectTitle: 'Network Monitor',
    domain: 'networking',
    tools: 'Go',
    status: 'Pending',
    pdfUrl: '',
  },
];

const accessors = {
  getMemberNames(project) {
    return (project.members || []).map((member) => member.name).filter(Boolean).join(' & ');
  },
  getMemberRollNumbers(project) {
    return (project.members || []).map((member) => member.rollNo).filter(Boolean).join(' | ');
  },
  getProgramName(program) {
    return { BSCS: 'BS Computer Science', BSAI: 'BS Artificial Intelligence' }[program] || program;
  },
  getProjectDomainDisplayLabels(project) {
    return project.domain === 'cyber-security' ? ['Cyber Security'] : [project.domain];
  },
  getProjectProgram(project) {
    return project.program || project.members?.[0]?.program || 'N/A';
  },
  hasProjectSubmission(project) {
    return Boolean(project.pdfUrl);
  },
  isProjectReviewable(project) {
    return Boolean(project.pdfUrl) && !['Approved', 'Rejected', 'Changes Requested'].includes(project.status);
  },
};

const defaultFilters = {
  batchFilter: 'All',
  programFilter: '',
  projectSearch: '',
  projectQueueFilter: 'all',
};

test('supervisor batch and program options stay unique and sorted', () => {
  assert.deepEqual(getUniqueSupervisorBatches(projects), ['Fall 2022', 'Fall 2023']);
  assert.deepEqual(
    getUniqueSupervisorPrograms(projects, ['BSCS', 'BSAI'], accessors),
    ['BSAI', 'BSCS', 'CUSTOM']
  );
});

test('supervisor filters enforce program, batch, and queue selections together', () => {
  assert.deepEqual(
    filterSupervisorProjects(
      projects,
      { ...defaultFilters, programFilter: 'BSCS', batchFilter: 'Fall 2023', projectQueueFilter: 'review' },
      accessors
    ).map((project) => project._id),
    ['project-1']
  );

  assert.deepEqual(
    filterSupervisorProjects(
      projects,
      { ...defaultFilters, projectQueueFilter: 'submitted' },
      accessors
    ).map((project) => project._id),
    ['project-1', 'project-2']
  );

  assert.deepEqual(
    filterSupervisorProjects(
      projects,
      { ...defaultFilters, projectQueueFilter: 'approved' },
      accessors
    ).map((project) => project._id),
    ['project-1', 'project-2']
  );
});

test('supervisor search covers members, roll numbers, programs, project details, and domains', () => {
  for (const query of [
    'sara noor',
    'f23-0102',
    'computer science',
    'secure student',
    'cyber security',
    'mongodb',
    'pending',
    'fall 2023',
    '8th',
  ]) {
    const ids = filterSupervisorProjects(
      projects,
      { ...defaultFilters, projectSearch: query },
      accessors
    ).map((project) => project._id);
    assert.ok(ids.includes('project-1'), `Expected query "${query}" to match project-1.`);
  }
});

test('dashboard statistics count projects that passed proposal approval', () => {
  const filtered = [projects[0]];

  assert.deepEqual(getSupervisorDashboardStats(projects, filtered, 'overview', accessors), {
    assigned: 3,
    submitted: 2,
    approved: 2,
    reviewQueue: 1,
  });
  assert.deepEqual(getSupervisorDashboardStats(projects, filtered, 'projects', accessors), {
    assigned: 1,
    submitted: 1,
    approved: 1,
    reviewQueue: 1,
  });
});
