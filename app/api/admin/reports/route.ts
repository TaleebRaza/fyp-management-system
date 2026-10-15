import { NextRequest, NextResponse } from 'next/server';
import type { PipelineStage } from 'mongoose';

import connectToDatabase from '../../../../lib/mongodb';
import {
  buildCollectedFineSummary,
  buildFineRestriction,
  COLLECTED_STUDENT_FINE_FILTER,
  OUTSTANDING_STUDENT_FINE_FILTER,
  type FineRestrictedUser,
} from '../../../../lib/fineRestriction';
import { APPROVED_PROJECT_STAGES } from '../../../../lib/projectReviewPolicy';
import { requireCurrentUser } from '../../../../lib/security/auth';
import Project from '../../../../models/Project';
import User from '../../../../models/User';
import { buildSupervisorLoginReport, type SupervisorLoginRow } from '../../../../lib/supervisorLoginReport';

export const dynamic = 'force-dynamic';

const FINE_DETAIL_LIMIT = 250;

type CountRow = {
  _id: unknown;
  total: number;
};

type SupervisorCountRow = CountRow & {
  active?: number;
  deactivated?: number;
};

type FinedStudentRecord = FineRestrictedUser & {
  name?: string;
  rollNo?: string;
  program?: string;
  batch?: string;
};

type StudentTotals = {
  students?: number;
  activeStudents?: number;
  deactivatedStudents?: number;
  assignedStudents?: number;
  unassignedStudents?: number;
};

type UserReportFacets = {
  studentsPerSupervisor: SupervisorCountRow[];
  studentActivity: CountRow[];
  programs: CountRow[];
  batches: CountRow[];
  finedStudents: FinedStudentRecord[];
  collectedFineStudents: FinedStudentRecord[];
  outstandingFineSummary: Array<{ total: number; totalFineAmount: number }>;
  studentTotals: StudentTotals[];
};

type ProjectReportRow = {
  _id: { status: unknown; stage: unknown };
  projects: number;
  students: number;
  withPdf: number;
  waitingForReview: number;
  approved: number;
};

const normalizeLabel = (value: unknown, fallback: string) => {
  const label = String(value || '').trim();
  return label || fallback;
};

const toLabelRows = (rows: CountRow[], fallback: string) => {
  return rows.map((row) => ({
    label: normalizeLabel(row._id, fallback),
    total: Number(row.total || 0),
  }));
};

const incrementCount = (counts: Map<string, number>, label: unknown, total: number) => {
  const key = String(label);
  counts.set(key, (counts.get(key) || 0) + Number(total || 0));
};

const countRows = (counts: Map<string, number>): CountRow[] => (
  [...counts].map(([_id, total]) => ({ _id, total })).sort((a, b) => b.total - a.total)
);

export async function GET(req: NextRequest) {
  try {
    if (!await requireCurrentUser(req, ['admin'])) {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
    }

    await connectToDatabase();

    const reportFacets = {
      studentsPerSupervisor: 'studentsPerSupervisor',
      studentStatusSummary: 'studentTotals',
      studentActivitySummary: 'studentActivity',
      programSummary: 'programs',
      batchSummary: 'batches',
      projectStatusSummary: '',
      projectStageSummary: '',
      pdfReviewSummary: '',
      finedStudents: 'finedStudents',
      collectedFineStudents: 'collectedFineStudents',
      supervisorLoginCounts: '',
    };
    const requestedReport = req.nextUrl.searchParams.get('report');
    if (requestedReport !== null && !Object.hasOwn(reportFacets, requestedReport)) {
      return NextResponse.json({ error: 'Unknown report.' }, { status: 400 });
    }
    const report = requestedReport as keyof typeof reportFacets | null;
    const needsAssignment = !report || report === 'studentsPerSupervisor' || report === 'studentStatusSummary';
    const needsSupervisors = !report || report === 'studentsPerSupervisor' || report === 'supervisorLoginCounts';

    const userPipeline: PipelineStage[] = [
      { $match: { role: 'student' } },
      {
        $lookup: {
          from: 'projects',
          localField: '_id',
          foreignField: 'members',
          pipeline: [
            { $project: { supervisorId: 1 } },
            { $limit: 1 },
          ],
          as: 'canonicalProjects',
        },
      },
      { $set: { canonicalProject: { $arrayElemAt: ['$canonicalProjects', 0] } } },
      {
        $facet: {
          studentsPerSupervisor: [
            {
              $group: {
                _id: {
                  $cond: [
                    { $eq: [{ $type: '$canonicalProject.supervisorId' }, 'objectId'] },
                    '$canonicalProject.supervisorId',
                    'unassigned',
                  ],
                },
                total: { $sum: 1 },
                active: { $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] } },
                deactivated: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] } },
              },
            },
            { $sort: { total: -1 } },
          ],
          studentActivity: [
            {
              $group: {
                _id: { $cond: [{ $eq: ['$isActive', false] }, 'Deactivated', 'Active'] },
                total: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ],
          programs: [
            { $group: { _id: { $ifNull: ['$program', 'No Program'] }, total: { $sum: 1 } } },
            { $sort: { total: -1 } },
          ],
          batches: [
            { $group: { _id: { $ifNull: ['$batch', 'No Batch'] }, total: { $sum: 1 } } },
            { $sort: { total: -1 } },
          ],
          finedStudents: [
            { $match: OUTSTANDING_STUDENT_FINE_FILTER },
            { $sort: { createdAt: -1, _id: -1 } },
            {
              $project: {
                name: 1,
                rollNo: 1,
                program: 1,
                batch: 1,
                lateRegistrationDays: 1,
                lateRegistrationFine: 1,
                lateRegistrationFineStatus: 1,
                registrationPunishment: 1,
              },
            },
            { $limit: FINE_DETAIL_LIMIT },
          ],
          collectedFineStudents: [
            { $match: COLLECTED_STUDENT_FINE_FILTER },
            { $sort: { createdAt: -1, _id: -1 } },
            {
              $project: {
                name: 1,
                rollNo: 1,
                program: 1,
                batch: 1,
                lateRegistrationDays: 1,
                lateRegistrationFine: 1,
                lateRegistrationFineStatus: 1,
                registrationPunishment: 1,
              },
            },
            { $limit: FINE_DETAIL_LIMIT },
          ],
          outstandingFineSummary: [
            { $match: OUTSTANDING_STUDENT_FINE_FILTER },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                totalFineAmount: {
                  $sum: {
                    $add: [
                      {
                        $cond: [
                          {
                            $and: [
                              { $gt: ['$lateRegistrationFine', 0] },
                              {
                                $not: [
                                  {
                                    $in: [
                                      { $ifNull: ['$lateRegistrationFineStatus', 'pending'] },
                                      ['resolved', 'waived'],
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          '$lateRegistrationFine',
                          0,
                        ],
                      },
                      {
                        $cond: [
                          {
                            $and: [
                              { $eq: ['$registrationPunishment.active', true] },
                              { $eq: ['$registrationPunishment.category', 'fine'] },
                              { $gt: ['$registrationPunishment.amount', 0] },
                              {
                                $not: [
                                  {
                                    $in: [
                                      { $ifNull: ['$registrationPunishment.status', 'pending'] },
                                      ['resolved', 'waived'],
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          '$registrationPunishment.amount',
                          0,
                        ],
                      },
                    ],
                  },
                },
              },
            },
          ],
          studentTotals: [
            {
              $group: {
                _id: null,
                students: { $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] } },
                activeStudents: { $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] } },
                deactivatedStudents: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] } },
                assignedStudents: {
                  $sum: {
                    $cond: [
                      { $eq: [{ $type: '$canonicalProject.supervisorId' }, 'objectId'] },
                      1,
                      0,
                    ],
                  },
                },
                unassignedStudents: {
                  $sum: {
                    $cond: [
                      { $ne: [{ $type: '$canonicalProject.supervisorId' }, 'objectId'] },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    ];
    if (report) {
      const facetStage = userPipeline.find((stage) => '$facet' in stage);
      if (facetStage && '$facet' in facetStage) {
        const facets = facetStage.$facet;
        for (const key of Object.keys(facets)) {
          if (key !== reportFacets[report] && key !== 'studentTotals' && key !== 'outstandingFineSummary') {
            delete facets[key];
          }
        }
        if (!needsAssignment) {
          const totalsStage = facets.studentTotals[0];
          if ('$group' in totalsStage) {
            const totals = totalsStage.$group as Record<string, unknown>;
            delete totals.assignedStudents;
            delete totals.unassignedStudents;
          }
        }
      }
    }

    const [userReports, supervisors, supervisorCount, projectReportRows] = await Promise.all([
      User.aggregate<UserReportFacets>(needsAssignment ? userPipeline : userPipeline.filter(
        (stage) => !('$lookup' in stage) && !('$set' in stage)
      )),
      needsSupervisors ? User.find({ role: 'supervisor' })
        .select('_id name rollNo monthlyLoginCount lastLoginMonth lastLoginAt')
        .lean<SupervisorLoginRow[]>() : Promise.resolve([] as SupervisorLoginRow[]),
      needsSupervisors ? Promise.resolve(null) : User.countDocuments({ role: 'supervisor' }),
      Project.aggregate<ProjectReportRow>([
        {
          $project: {
            status: { $ifNull: ['$status', 'Pending'] },
            stage: { $ifNull: ['$stage', 'PROPOSAL'] },
            students: {
              $cond: [
                { $eq: [{ $type: '$supervisorId' }, 'objectId'] },
                { $cond: [{ $isArray: '$members' }, { $size: '$members' }, 0] },
                0,
              ],
            },
            hasPdf: { $gt: [{ $strLenCP: { $ifNull: ['$pdfUrl', ''] } }, 0] },
          },
        },
        {
          $group: {
            _id: { status: '$status', stage: '$stage' },
            projects: { $sum: 1 },
            students: { $sum: '$students' },
            withPdf: { $sum: { $cond: ['$hasPdf', 1, 0] } },
            waitingForReview: {
              $sum: {
                $cond: [
                  { $and: ['$hasPdf', { $eq: ['$status', 'Submitted For Review'] }] },
                  1,
                  0,
                ],
              },
            },
            approved: {
              $sum: {
                $cond: [
                  { $or: [{ $eq: ['$status', 'Approved'] }, { $in: ['$stage', APPROVED_PROJECT_STAGES] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const userReport = userReports[0];
    const projectStatusCounts = new Map<string, number>();
    const studentStatusCounts = new Map<string, number>();
    const projectStageCounts = new Map<string, number>();
    const pdfReview = { totalProjects: 0, withPdf: 0, waitingForReview: 0, approved: 0 };
    for (const row of projectReportRows) {
      incrementCount(projectStatusCounts, row._id.status, row.projects);
      if (row.students > 0) incrementCount(studentStatusCounts, row._id.status, row.students);
      incrementCount(projectStageCounts, row._id.stage, row.projects);
      pdfReview.totalProjects += Number(row.projects || 0);
      pdfReview.withPdf += Number(row.withPdf || 0);
      pdfReview.waitingForReview += Number(row.waitingForReview || 0);
      pdfReview.approved += Number(row.approved || 0);
    }
    const projectStatus = countRows(projectStatusCounts);
    const studentStatus = countRows(studentStatusCounts);
    const projectStage = countRows(projectStageCounts);
    const studentsPerSupervisorRaw = userReport?.studentsPerSupervisor || [];
    const supervisorMap = new Map(
      supervisors.map((supervisor) => [
        String(supervisor._id),
        supervisor.name || supervisor.rollNo || 'Unknown Supervisor',
      ])
    );

    const supervisorRows = supervisors.map((supervisor) => {
      const raw = studentsPerSupervisorRaw.find((item) => String(item._id) === String(supervisor._id));

      return {
        supervisorId: String(supervisor._id),
        label: supervisor.name || supervisor.rollNo || 'Unknown Supervisor',
        total: Number(raw?.total || 0),
        active: Number(raw?.active || 0),
        deactivated: Number(raw?.deactivated || 0),
      };
    });

    const extraRows = studentsPerSupervisorRaw
      .filter((item) => {
        const id = String(item._id || 'unassigned');
        return id === 'unassigned' || !supervisorMap.has(id);
      })
      .map((item) => {
        const id = String(item._id || 'unassigned');

        return {
          supervisorId: id,
          label: id === 'unassigned' ? 'Unassigned Students' : 'Unknown Supervisor',
          total: Number(item.total || 0),
          active: Number(item.active || 0),
          deactivated: Number(item.deactivated || 0),
        };
      });

    const studentsPerSupervisor = [...supervisorRows, ...extraRows].sort((a, b) => b.total - a.total);
    const studentTotals = userReport?.studentTotals[0]
      || { students: 0, activeStudents: 0, deactivatedStudents: 0, assignedStudents: 0, unassignedStudents: 0 };
    const finedStudents = (userReport?.finedStudents || []).flatMap((student) => {
      const restriction = buildFineRestriction(student);
      if (!restriction) return [];

      const breakdown = [
        restriction.lateRegistrationFine
          ? `Late registration: PKR ${restriction.lateRegistrationFine.amount.toLocaleString()}`
          : '',
        restriction.adminFine
          ? `Admin fine: PKR ${restriction.adminFine.amount.toLocaleString()}`
          : '',
      ].filter(Boolean);

      return [{
        label: `${student.name || 'Unknown Student'} (${student.rollNo || 'No Roll No'})`,
        fineAmount: restriction.totalAmount,
        daysLate: restriction.lateRegistrationFine?.daysLate || 0,
        lateFineAmount: restriction.lateRegistrationFine?.amount || 0,
        adminFineAmount: restriction.adminFine?.amount || 0,
        fineBreakdown: breakdown.join(' + '),
        program: student.program || 'No Program',
        batch: student.batch || 'No Batch',
      }];
    });
    const outstandingFineSummary = userReport?.outstandingFineSummary[0];
    const totalFineAmount = Number(outstandingFineSummary?.totalFineAmount || 0);
    const collectedFineStudents = (userReport?.collectedFineStudents || []).flatMap((student) => {
      const collection = buildCollectedFineSummary(student);
      if (!collection) return [];

      const breakdown = [
        collection.lateRegistrationFine
          ? `Late registration: PKR ${collection.lateRegistrationFine.amount.toLocaleString()}`
          : '',
        collection.adminFine
          ? `${collection.adminFine.title}: PKR ${collection.adminFine.amount.toLocaleString()}`
          : '',
      ].filter(Boolean);

      return [{
        label: `${student.name || 'Unknown Student'} (${student.rollNo || 'No Roll No'})`,
        fineAmount: collection.totalAmount,
        daysLate: collection.lateRegistrationFine?.daysLate || 0,
        fineBreakdown: breakdown.join(' + '),
        program: student.program || 'No Program',
        batch: student.batch || 'No Batch',
      }];
    });

    const students = Number(studentTotals.students || 0);
    const activeStudents = Number(studentTotals.activeStudents || 0);
    const deactivatedStudents = Number(studentTotals.deactivatedStudents || 0);
    const assignedStudents = Number(studentTotals.assignedStudents || 0);
    const unassignedStudents = Number(studentTotals.unassignedStudents || 0);
    const canonicalStudentStatus = [...studentStatus];
    if (unassignedStudents > 0) {
      canonicalStudentStatus.push({ _id: 'Unassigned', total: unassignedStudents });
    }
    const pdfReviewSummary = [
      { label: 'Projects with PDF', total: Number(pdfReview.withPdf || 0) },
      { label: 'Waiting for Review', total: Number(pdfReview.waitingForReview || 0) },
      { label: 'Approved Projects', total: Number(pdfReview.approved || 0) },
      {
        label: 'Projects without PDF',
        total: Math.max(Number(pdfReview.totalProjects || 0) - Number(pdfReview.withPdf || 0), 0),
      },
    ];

    const supervisorLoginCounts = buildSupervisorLoginReport(supervisors);

    const responseData = {
      generatedAt: new Date().toISOString(),
      totals: {
        students,
        activeStudents,
        deactivatedStudents,
        supervisors: supervisorCount ?? supervisors.length,
        ...(needsAssignment ? { assignedStudents, unassignedStudents } : {}),
        projects: pdfReview.totalProjects,
        reviewQueue: Number(pdfReview.waitingForReview || 0),
        projectsWithPdf: Number(pdfReview.withPdf || 0),
        finedStudents: Number(outstandingFineSummary?.total || 0),
        totalFineAmount,
      },
      finedStudents,
      collectedFineStudents,
      studentsPerSupervisor,
      studentStatusSummary: toLabelRows(canonicalStudentStatus, 'No Status'),
      studentActivitySummary: toLabelRows(userReport?.studentActivity || [], 'Unknown'),
      programSummary: toLabelRows(userReport?.programs || [], 'No Program'),
      batchSummary: toLabelRows(userReport?.batches || [], 'No Batch'),
      projectStatusSummary: toLabelRows(projectStatus, 'Pending'),
      projectStageSummary: toLabelRows(projectStage, 'PROPOSAL'),
      pdfReviewSummary,
      supervisorLoginCounts,
    };
    return NextResponse.json(
      report ? { generatedAt: responseData.generatedAt, totals: responseData.totals, [report]: responseData[report] } : responseData,
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Admin Reports Error:', error);
    return NextResponse.json({ error: 'Failed to fetch report data' }, { status: 500 });
  }
}
