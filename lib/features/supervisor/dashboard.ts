import { DEFAULT_TEAM_SIZE, getTeamCapacity } from '../../../config/appSettings';
import { formatProjectDomainLabels, normalizeProjectDomainIds } from '../../../config/projectDomains';
import { getSafeProjectRatings } from '../../../config/projectRatings';
import Project from '../../../models/Project';
import User from '../../../models/User';
import type { CurrentUser } from '../../security/auth';

export type SupervisorDashboardFields = { migrationCode?: string };
export type SupervisorDashboardUser = CurrentUser<SupervisorDashboardFields>;

export const SUPERVISOR_DASHBOARD_AUTH_FIELDS = '+migrationCode';

type SupervisorProjectRow = {
  _id: unknown;
  members?: unknown[];
  title?: string;
  description?: string;
  domains?: unknown;
  tools?: string;
  pdfUrl?: string;
  status?: string;
  reviewRemarks?: string;
  stage?: string;
  version?: number;
  ratings?: unknown;
  maxTeamSize?: number;
};

type SupervisorStudentRow = {
  _id: unknown;
  name?: string;
  rollNo?: string;
  email?: string;
  program?: string;
  batch?: string;
  semester?: string;
};

export async function getSupervisorDashboard(supervisor: SupervisorDashboardUser) {
  const projects = await Project.find({ supervisorId: supervisor.id })
    .select('_id members title description domains tools pdfUrl status reviewRemarks stage version ratings maxTeamSize')
    .lean();
  const projectRows = projects as unknown as SupervisorProjectRow[];
  const memberIds = Array.from(new Set(
    projectRows.flatMap((project) =>
      (project.members || []).map((memberId) => String(memberId))
    )
  ));
  const students = memberIds.length > 0
    ? await User.find({ _id: { $in: memberIds }, role: 'student' })
        .select('_id name rollNo email program batch semester')
        .lean()
    : [];
  const studentsById = new Map(
    (students as unknown as SupervisorStudentRow[]).map((student) => [String(student._id), student])
  );

  return {
    projects: projectRows.flatMap((project) => {
      const members = (project.members || []).flatMap((memberId) => {
        const student = studentsById.get(String(memberId));
        return student ? [student] : [];
      });
      const firstMember = members[0];
      if (!firstMember) return [];

      const domainIds = normalizeProjectDomainIds(project.domains);
      return [{
        _id: String(project._id),
        triggerStudentId: String(firstMember._id),
        projectTitle: project.title,
        projectDesc: project.description,
        domain: formatProjectDomainLabels(domainIds),
        domains: domainIds,
        tools: project.tools,
        pdfUrl: project.pdfUrl,
        status: project.status,
        remarks: project.reviewRemarks,
        stage: project.stage || 'PROPOSAL',
        version: Number(project.version || 0),
        ratings: getSafeProjectRatings(project.ratings),
        maxTeamSize: getTeamCapacity(project.maxTeamSize) || DEFAULT_TEAM_SIZE,
        program: firstMember.program || 'N/A',
        batch: firstMember.batch || 'N/A',
        semester: firstMember.semester || '7th Semester',
        members: members.map((student) => ({
          _id: student._id,
          name: student.name,
          rollNo: student.rollNo,
          email: student.email,
          program: student.program || 'N/A',
          batch: student.batch || 'N/A',
          semester: student.semester || '7th Semester',
        })),
      }];
    }),
    migrationCode: supervisor.migrationCode || '',
  };
}
