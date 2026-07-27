import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../config/projectDomains';
import { DEFAULT_TEAM_SIZE, getTeamCapacity } from './teamCapacity';
import Project from '../models/Project';
import User from '../models/User';
import type { ProjectReviewProject } from '../types/projectReview';

type QueueProjectRecord = {
  _id: unknown;
  supervisorId?: unknown;
  members: unknown[];
  title?: string;
  domain?: string;
  domains?: unknown;
  pdfUrl?: string;
  status?: string;
  stage?: string;
  maxTeamSize?: number;
};

type QueueUserRecord = {
  _id: unknown;
  role?: string;
  name?: string;
  rollNo?: string;
  email?: string;
  program?: string;
  batch?: string;
  semester?: string;
  projectTitle?: string;
  projectDesc?: string;
  domain?: string;
  domains?: unknown;
  tools?: string;
};

export async function getAdminProjectReviewQueue(): Promise<ProjectReviewProject[]> {
  const projects = await Project.find({
    status: 'Submitted For Review',
    supervisorId: { $ne: null },
    pdfUrl: { $type: 'string', $ne: '' },
  })
    .select('_id supervisorId members title domain domains pdfUrl status stage maxTeamSize')
    .sort({ updatedAt: -1 })
    .lean<QueueProjectRecord[]>();

  const relatedUserIds = projects.flatMap((project) => [
    ...project.members,
    ...(project.supervisorId ? [project.supervisorId] : []),
  ]);
  const users = await User.find({ _id: { $in: relatedUserIds } })
    .select('_id role name rollNo email program batch semester projectTitle projectDesc domain domains tools')
    .lean<QueueUserRecord[]>();
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  return projects.flatMap<ProjectReviewProject>((project) => {
    const memberUsers = project.members.flatMap((memberId) => {
      const member = usersById.get(String(memberId));
      return member?.role === 'student' ? [member] : [];
    });
    const firstMember = memberUsers[0];
    if (!firstMember) return [];

    const supervisor = project.supervisorId
      ? usersById.get(String(project.supervisorId))
      : undefined;
    const domainIds = normalizeProjectDomainIds(
      Array.isArray(project.domains) && project.domains.length > 0 ? project.domains : firstMember.domains,
      project.domain || firstMember.domain
    );

    return [{
      _id: String(project._id),
      triggerStudentId: String(firstMember._id),
      supervisorName: supervisor?.role === 'supervisor' ? supervisor.name : 'Assigned Supervisor',
      projectTitle: project.title || firstMember.projectTitle,
      projectDesc: firstMember.projectDesc,
      domain: formatProjectDomainLabels(domainIds, project.domain || firstMember.domain),
      domains: domainIds,
      tools: firstMember.tools,
      pdfUrl: project.pdfUrl,
      status: project.status,
      stage: project.stage || 'PROPOSAL',
      maxTeamSize: getTeamCapacity(project.maxTeamSize) || DEFAULT_TEAM_SIZE,
      program: firstMember.program || 'N/A',
      batch: firstMember.batch || 'N/A',
      semester: firstMember.semester || '7th Semester',
      members: memberUsers.map((member) => ({
        _id: String(member._id),
        name: member.name,
        rollNo: member.rollNo,
        email: member.email,
        program: member.program || 'N/A',
      })),
    }];
  });
}
