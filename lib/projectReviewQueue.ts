import { performance } from 'node:perf_hooks';

import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../config/projectDomains';
import Project from '../models/Project';
import User from '../models/User';
import type { ProjectReviewProject } from '../types/projectReview';
import { DEFAULT_TEAM_SIZE, getTeamCapacity } from './teamCapacity';

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

export type AdminProjectReviewQueueOptions = {
  page?: number;
  limit?: number;
  search?: string;
  program?: string;
};

export type AdminProjectReviewQueueResult = {
  projects: ProjectReviewProject[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  timings: {
    filterLookupMs: number;
    projectQueryMs: number;
    userQueryMs: number;
    mappingMs: number;
  };
};

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 50;

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value as number), min), max);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildUserSearchClauses(regex: RegExp) {
  return [
    { name: regex },
    { rollNo: regex },
    { email: regex },
    { program: regex },
    { batch: regex },
    { semester: regex },
    { projectTitle: regex },
    { projectDesc: regex },
    { domain: regex },
    { domains: regex },
    { tools: regex },
  ];
}

export async function getAdminProjectReviewQueue(
  options: AdminProjectReviewQueueOptions = {}
): Promise<AdminProjectReviewQueueResult> {
  const page = clampInteger(options.page, 1, 1, Number.MAX_SAFE_INTEGER);
  const limit = clampInteger(options.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const search = String(options.search || '').trim();
  const program = String(options.program || '').trim();
  const searchRegex = search ? new RegExp(escapeRegex(search), 'i') : null;

  const filterLookupStarted = performance.now();
  const [programStudentIds, searchStudentIds, searchSupervisorIds] = await Promise.all([
    program
      ? User.distinct('_id', { role: 'student', program }).exec()
      : Promise.resolve([]),
    searchRegex
      ? User.distinct('_id', {
          role: 'student',
          $or: buildUserSearchClauses(searchRegex),
        }).exec()
      : Promise.resolve([]),
    searchRegex
      ? User.distinct('_id', {
          role: 'supervisor',
          $or: [
            { name: searchRegex },
            { rollNo: searchRegex },
            { email: searchRegex },
          ],
        }).exec()
      : Promise.resolve([]),
  ]);
  const filterLookupMs = performance.now() - filterLookupStarted;

  if (program && programStudentIds.length === 0) {
    return {
      projects: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
      timings: {
        filterLookupMs,
        projectQueryMs: 0,
        userQueryMs: 0,
        mappingMs: 0,
      },
    };
  }

  const additionalConditions: Record<string, unknown>[] = [];

  if (program) {
    additionalConditions.push({ members: { $in: programStudentIds } });
  }

  if (searchRegex) {
    const searchConditions: Record<string, unknown>[] = [
      { title: searchRegex },
      { domain: searchRegex },
      { domains: searchRegex },
      { status: searchRegex },
      { stage: searchRegex },
    ];

    if (searchStudentIds.length > 0) {
      searchConditions.push({ members: { $in: searchStudentIds } });
    }

    if (searchSupervisorIds.length > 0) {
      searchConditions.push({ supervisorId: { $in: searchSupervisorIds } });
    }

    additionalConditions.push({ $or: searchConditions });
  }

  const projectFilter: Record<string, unknown> = {
    status: 'Submitted For Review',
    supervisorId: { $ne: null },
    pdfUrl: { $type: 'string', $ne: '' },
  };

  if (additionalConditions.length > 0) {
    projectFilter.$and = additionalConditions;
  }

  const projectQueryStarted = performance.now();
  const [projects, total] = await Promise.all([
    Project.find(projectFilter)
      .select('_id supervisorId members title domain domains pdfUrl status stage maxTeamSize')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<QueueProjectRecord[]>(),
    Project.countDocuments(projectFilter),
  ]);
  const projectQueryMs = performance.now() - projectQueryStarted;

  const relatedUserIds = Array.from(new Set(
    projects.flatMap((project) => [
      ...project.members.map((memberId) => String(memberId)),
      ...(project.supervisorId ? [String(project.supervisorId)] : []),
    ])
  ));

  const userQueryStarted = performance.now();
  const users = relatedUserIds.length > 0
    ? await User.find({ _id: { $in: relatedUserIds } })
        .select('_id role name rollNo email program batch semester projectTitle projectDesc domain domains tools')
        .lean<QueueUserRecord[]>()
    : [];
  const userQueryMs = performance.now() - userQueryStarted;

  const mappingStarted = performance.now();
  const usersById = new Map(users.map((user) => [String(user._id), user]));
  const mappedProjects = projects.flatMap<ProjectReviewProject>((project) => {
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
      Array.isArray(project.domains) && project.domains.length > 0
        ? project.domains
        : firstMember.domains,
      project.domain || firstMember.domain
    );

    return [{
      _id: String(project._id),
      triggerStudentId: String(firstMember._id),
      supervisorName: supervisor?.role === 'supervisor'
        ? supervisor.name
        : 'Assigned Supervisor',
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
  const mappingMs = performance.now() - mappingStarted;

  return {
    projects: mappedProjects,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
    timings: {
      filterLookupMs,
      projectQueryMs,
      userQueryMs,
      mappingMs,
    },
  };
}
