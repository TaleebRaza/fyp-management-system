import { describe, expect, it } from 'vitest';

import { reconcileProjectData } from '../lib/projectDataReconciliation';

describe('project data reconciliation', () => {
  it('separates matching state from missing, conflicting, and orphaned records', () => {
    const report = reconcileProjectData([
      { _id: 'student-1', projectId: 'project-1', supervisorId: 'supervisor-1', status: 'Pending', projectTitle: 'Portal', domain: 'AI', domains: ['ai'], pdfUrl: 'proposal.pdf' },
      { _id: 'student-2', projectId: 'missing-project' },
      { _id: 'student-3', projectId: 'project-2', supervisorId: 'supervisor-1', status: 'Pending', projectTitle: 'Old title', domain: 'AI', domains: ['web', 'ai'], pdfUrl: 'old.pdf' },
    ], [
      { _id: 'project-1', members: ['student-1'], supervisorId: 'supervisor-1', status: 'Pending', title: 'Portal', domain: 'AI', domains: ['ai'], pdfUrl: 'proposal.pdf' },
      { _id: 'project-2', members: ['student-3', 'missing-student'], supervisorId: 'supervisor-2', status: 'Submitted', title: 'New title', domain: 'Web', domains: ['ai', 'web'], pdfUrl: 'new.pdf' },
      { _id: 'project-3', members: [] },
    ]);

    expect(report.matching).toEqual({ count: 1, projectIds: ['project-1'] });
    expect(report.missing).toEqual({
      projects: [{ studentId: 'student-2', projectId: 'missing-project' }],
      students: [{ projectId: 'project-2', studentId: 'missing-student' }],
    });
    expect(report.conflicts.fields).toEqual([{
      projectId: 'project-2',
      studentId: 'student-3',
      fields: ['supervisorId', 'status', 'title', 'domain', 'pdfUrl'],
    }]);
    expect(report.conflicts.memberships).toEqual([]);
    expect(report.orphaned).toEqual({ projectIds: ['project-3'] });
  });

  it('catches a student project link that is missing from project members', () => {
    const report = reconcileProjectData([
      { _id: 'student-1', projectId: 'project-1' },
    ], [
      { _id: 'project-1', members: [] },
    ]);

    expect(report.conflicts.memberships).toEqual([{
      projectId: 'project-1',
      studentId: 'student-1',
      studentProjectId: 'project-1',
      reason: 'student-not-member',
    }]);
    expect(report.matching.count).toBe(0);
  });
});
