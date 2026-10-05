import { performance } from 'node:perf_hooks';
import mongoose from 'mongoose';

import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../config/projectDomains';
import { DEFAULT_TEAM_SIZE, getTeamCapacity } from '../config/appSettings';
import { getSafeProjectRatings } from '../config/projectRatings';
import Project from '../models/Project';
import User from '../models/User';
import type { ProjectReviewProject } from '../types/projectReview';

type QueueProjectRecord = {
  _id: unknown;
  updatedAt: Date;
  supervisorId?: unknown;
    members: unknown[];
  title?: string;
  description?: string;
  domains?: unknown;
  tools?: string;
  pdfUrl?: string;
  status?: string;
  stage?: string;
  version?: number;
  ratings?: unknown;
  reviewRemarks?: string;
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
};

export type AdminProjectReviewQueueOptions = {
  page?: number;
  limit?: number;
  cursor?: string;
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
  nextCursor: string | null;
  timings: {
    filterLookupMs: number;
    projectQueryMs: number;
    userQueryMs: number;
    mappingMs: number;
  };
};

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 50;
const MAX_PAGE = 1_000;

type ReviewQueueCursor = {
  updatedAt: string;
  id: string;
};

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value as number), min), max);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseAdminProjectReviewCursor(value: string | null | undefined): ReviewQueueCursor | null {
  if (!value) return null;

  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as ReviewQueueCursor;
    if (
      !cursor
      || typeof cursor.updatedAt !== 'string'
      || Number.isNaN(new Date(cursor.updatedAt).getTime())
      || !mongoose.Types.ObjectId.isValid(cursor.id)
    ) {
      return null;
    }
    return cursor;
  } catch {
    return null;
  }
}

function createReviewQueueCursor(project: QueueProjectRecord | undefined) {
  if (!project?.updatedAt || !project._id) return null;

  return Buffer.from(JSON.stringify({
    updatedAt: project.updatedAt.toISOString(),
    id: String(project._id),
  })).toString('base64url');
}

function buildUserSearchClauses(regex: RegExp) {
  return [
    { name: regex },
    { rollNo: regex },
    { email: regex },
    { program: regex },
    { batch: regex },
    { semester: regex },
  ];
}

export async function getAdminProjectReviewQueue(
  options: AdminProjectReviewQueueOptions = {}
): Promise<AdminProjectReviewQueueResult> {
  const page = clampInteger(options.page, 1, 1, MAX_PAGE);
  const limit = clampInteger(options.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const search = String(options.search || '').trim();
  const program = String(options.program || '').trim();
  const cursor = parseAdminProjectReviewCursor(options.cursor);
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
      nextCursor: null,
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
      { description: searchRegex },
      { domains: searchRegex },
      { tools: searchRegex },
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
    status: { $in: ['Submitted For Review', 'Document Approved'] },
    supervisorId: { $ne: null },
    pdfUrl: { $type: 'string', $ne: '' },
  };

  if (additionalConditions.length > 0) {
    projectFilter.$and = additionalConditions;
  }

  const pageFilter = cursor
    ? {
        $and: [
          projectFilter,
          // ponytail: mutable updatedAt cursors omit rows moved ahead mid-walk; restart at page 1 to include them.
          {
            $or: [
              { updatedAt: { $lt: new Date(cursor.updatedAt) } },
              {
                updatedAt: new Date(cursor.updatedAt),
                _id: { $lt: new mongoose.Types.ObjectId(cursor.id) },
              },
            ],
          },
        ],
      }
    : projectFilter;

  const projectQueryStarted = performance.now();
  const [projects, total] = await Promise.all([
    Project.find(pageFilter)
      .select('_id updatedAt supervisorId members title description domains tools pdfUrl status reviewRemarks stage version ratings maxTeamSize')
      .sort({ updatedAt: -1, _id: -1 })
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
        .select('_id role name rollNo email program batch semester')
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
        const domainIds = normalizeProjectDomainIds(project.domains);

    return [{
      _id: String(project._id),
      triggerStudentId: String(firstMember._id),
      supervisorName: supervisor?.role === 'supervisor'
        ? supervisor.name
        : 'Assigned Supervisor',
            projectTitle: project.title,
      projectDesc: project.description,
      domain: formatProjectDomainLabels(domainIds),
      domains: domainIds,
      tools: project.tools,
      pdfUrl: project.pdfUrl,
      status: project.status,
      reviewRemarks: project.reviewRemarks,
      stage: project.stage || 'PROPOSAL',
      version: Number(project.version || 0),
      ratings: getSafeProjectRatings(project.ratings),
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
    nextCursor: projects.length === limit
      ? createReviewQueueCursor(projects.at(-1))
      : null,
    timings: {
      filterLookupMs,
      projectQueryMs,
      userQueryMs,
      mappingMs,
    },
  };
}
