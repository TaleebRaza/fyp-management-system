type ProjectDataStudent = {
  _id: unknown;
  projectId?: unknown;
  supervisorId?: unknown;
  status?: unknown;
  projectTitle?: unknown;
  domain?: unknown;
  domains?: unknown;
  pdfUrl?: unknown;
};

type ProjectDataProject = {
  _id: unknown;
  members?: unknown;
  supervisorId?: unknown;
  status?: unknown;
  title?: unknown;
  domain?: unknown;
  domains?: unknown;
  pdfUrl?: unknown;
};

const asId = (value: unknown) => String(value || '');
const asText = (value: unknown) => String(value || '').trim();
const asDomainIds = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.map(asText).filter(Boolean))].sort()
  : [];

function differentFields(student: ProjectDataStudent, project: ProjectDataProject) {
  const comparisons = [
    ['supervisorId', asId(student.supervisorId), asId(project.supervisorId)],
    ['status', asText(student.status), asText(project.status)],
    ['title', asText(student.projectTitle), asText(project.title)],
    ['domain', asText(student.domain), asText(project.domain)],
    ['domains', asDomainIds(student.domains).join(','), asDomainIds(project.domains).join(',')],
    ['pdfUrl', asText(student.pdfUrl), asText(project.pdfUrl)],
  ] as const;

  return comparisons
    .filter(([, studentValue, projectValue]) => studentValue !== projectValue)
    .map(([field]) => field);
}

export function reconcileProjectData(
  students: ProjectDataStudent[],
  projects: ProjectDataProject[]
) {
  const studentsById = new Map(students.map(student => [asId(student._id), student]));
  const projectsById = new Map(projects.map(project => [asId(project._id), project]));
  const missingProjects = students.flatMap(student => {
    const projectId = asId(student.projectId);
    return projectId && !projectsById.has(projectId)
      ? [{ studentId: asId(student._id), projectId }]
      : [];
  });
  const missingStudents: Array<{ projectId: string; studentId: string }> = [];
  const membershipConflicts: Array<{
    projectId: string;
    studentId: string;
    studentProjectId: string;
    reason: 'student-not-member' | 'project-member-mismatch';
  }> = [];
  const fieldConflicts: Array<{ projectId: string; studentId: string; fields: string[] }> = [];
  const matchingProjectIds: string[] = [];
  const orphanedProjectIds: string[] = [];
  const memberIdsByProject = new Map(
    projects.map(project => [
      asId(project._id),
      new Set(Array.isArray(project.members) ? project.members.map(asId).filter(Boolean) : []),
    ])
  );
  const conflictedProjectIds = new Set<string>();

  students.forEach(student => {
    const projectId = asId(student.projectId);
    if (projectId && projectsById.has(projectId) && !memberIdsByProject.get(projectId)?.has(asId(student._id))) {
      membershipConflicts.push({
        projectId,
        studentId: asId(student._id),
        studentProjectId: projectId,
        reason: 'student-not-member',
      });
      conflictedProjectIds.add(projectId);
    }
  });

  projects.forEach(project => {
    const projectId = asId(project._id);
    const memberIds = [...new Set(Array.isArray(project.members) ? project.members.map(asId).filter(Boolean) : [])];
    let isMatching = memberIds.length > 0 && !conflictedProjectIds.has(projectId);

    if (!memberIds.length) orphanedProjectIds.push(projectId);

    memberIds.forEach(studentId => {
      const student = studentsById.get(studentId);
      if (!student) {
        missingStudents.push({ projectId, studentId });
        isMatching = false;
        return;
      }

      const studentProjectId = asId(student.projectId);
      if (studentProjectId !== projectId) {
        membershipConflicts.push({
          projectId,
          studentId,
          studentProjectId,
          reason: 'project-member-mismatch',
        });
        isMatching = false;
      }

      const fields = differentFields(student, project);
      if (fields.length) {
        fieldConflicts.push({ projectId, studentId, fields });
        isMatching = false;
      }
    });

    if (isMatching) matchingProjectIds.push(projectId);
  });

  return {
    studentCount: students.length,
    projectCount: projects.length,
    matching: { count: matchingProjectIds.length, projectIds: matchingProjectIds },
    missing: { projects: missingProjects, students: missingStudents },
    conflicts: { memberships: membershipConflicts, fields: fieldConflicts },
    orphaned: { projectIds: orphanedProjectIds },
  };
}
