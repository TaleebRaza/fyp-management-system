import { NextRequest, NextResponse } from 'next/server';

import connectToDatabase from '../../../../lib/mongodb';
import {
  buildCollectedFineSummary,
  buildFineRestriction,
  COLLECTED_STUDENT_FINE_FILTER,
  OUTSTANDING_STUDENT_FINE_FILTER,
  type FineRestrictedUser,
} from '../../../../lib/fineRestriction';
import {
  APPROVED_PROJECT_STAGES,
  REVIEWED_PROJECT_STATUSES,
} from '../../../../lib/projectReviewPolicy';
import { requireCurrentUser } from '../../../../lib/security/auth';
import Project from '../../../../models/Project';
import User from '../../../../models/User';

export const dynamic = 'force-dynamic';

const FINE_DETAIL_LIMIT = 250;

type CountRow = {
  _id: unknown;
  total: number;
};

type SupervisorRow = {
  _id: unknown;
  name?: string;
  rollNo?: string;
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

type PdfReview = {
  totalProjects?: number;
  withPdf?: number;
  waitingForReview?: number;
  approved?: number;
};

type UserReportFacets = {
  supervisors: SupervisorRow[];
  studentsPerSupervisor: SupervisorCountRow[];
  studentStatus: CountRow[];
  studentActivity: CountRow[];
  programs: CountRow[];
  batches: CountRow[];
  finedStudents: FinedStudentRecord[];
  collectedFineStudents: FinedStudentRecord[];
  outstandingFineSummary: Array<{ total: number; totalFineAmount: number }>;
  studentTotals: StudentTotals[];
  supervisorCount: Array<{ total: number }>;
};

type ProjectReportFacets = {
  projectStatus: CountRow[];
  projectStage: CountRow[];
  pdfReview: PdfReview[];
  projectTotals: Array<{ total: number }>;
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

export async function GET(req: NextRequest) {
  try {
    if (!await requireCurrentUser(req, ['admin'])) {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
    }

    await connectToDatabase();

    const [userReports, projectReports] = await Promise.all([
      User.aggregate<UserReportFacets>([
        {
          $facet: {
            supervisors: [
              { $match: { role: 'supervisor' } },
              { $project: { _id: 1, name: 1, rollNo: 1 } },
            ],
            studentsPerSupervisor: [
              { $match: { role: 'student' } },
              {
                $group: {
                  _id: {
                    $cond: [
                      { $eq: [{ $type: '$supervisorId' }, 'objectId'] },
                      '$supervisorId',
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
            studentStatus: [
              { $match: { role: 'student' } },
              { $group: { _id: { $ifNull: ['$status', 'No Status'] }, total: { $sum: 1 } } },
              { $sort: { total: -1 } },
            ],
            studentActivity: [
              { $match: { role: 'student' } },
              {
                $group: {
                  _id: { $cond: [{ $eq: ['$isActive', false] }, 'Deactivated', 'Active'] },
                  total: { $sum: 1 },
                },
              },
              { $sort: { total: -1 } },
            ],
            programs: [
              { $match: { role: 'student' } },
              { $group: { _id: { $ifNull: ['$program', 'No Program'] }, total: { $sum: 1 } } },
              { $sort: { total: -1 } },
            ],
            batches: [
              { $match: { role: 'student' } },
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
              { $match: { role: 'student' } },
              {
                $group: {
                  _id: null,
                  students: { $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] } },
                  activeStudents: { $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] } },
                  deactivatedStudents: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] } },
                  assignedStudents: {
                    $sum: {
                      $cond: [{ $eq: [{ $type: '$supervisorId' }, 'objectId'] }, 1, 0],
                    },
                  },
                  unassignedStudents: {
                    $sum: {
                      $cond: [{ $ne: [{ $type: '$supervisorId' }, 'objectId'] }, 1, 0],
                    },
                  },
                },
              },
            ],
            supervisorCount: [
              { $match: { role: 'supervisor' } },
              { $count: 'total' },
            ],
          },
        },
      ]),
      Project.aggregate<ProjectReportFacets>([
        {
          $facet: {
            projectStatus: [
              { $group: { _id: { $ifNull: ['$status', 'Pending'] }, total: { $sum: 1 } } },
              { $sort: { total: -1 } },
            ],
            projectStage: [
              { $group: { _id: { $ifNull: ['$stage', 'PROPOSAL'] }, total: { $sum: 1 } } },
              { $sort: { total: -1 } },
            ],
            pdfReview: [
              {
                $group: {
                  _id: null,
                  totalProjects: { $sum: 1 },
                  withPdf: {
                    $sum: {
                      $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$pdfUrl', ''] } }, 0] }, 1, 0],
                    },
                  },
                  waitingForReview: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $gt: [{ $strLenCP: { $ifNull: ['$pdfUrl', ''] } }, 0] },
                            {
                              $not: [
                                {
                                  $in: [
                                    { $ifNull: ['$status', 'Pending'] },
                                    REVIEWED_PROJECT_STATUSES,
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  approved: {
                    $sum: {
                      $cond: [
                        {
                          $or: [
                            { $eq: ['$status', 'Approved'] },
                            { $in: [{ $ifNull: ['$stage', 'PROPOSAL'] }, APPROVED_PROJECT_STAGES] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },
            ],
            projectTotals: [{ $count: 'total' }],
          },
        },
      ]),
    ]);

    const userReport = userReports[0];
    const projectReport = projectReports[0];
    const supervisors = userReport?.supervisors || [];
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
    const pdfReview = projectReport?.pdfReview[0] || { totalProjects: 0, withPdf: 0, waitingForReview: 0, approved: 0 };
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
    const pdfReviewSummary = [
      { label: 'Projects with PDF', total: Number(pdfReview.withPdf || 0) },
      { label: 'Waiting for Review', total: Number(pdfReview.waitingForReview || 0) },
      { label: 'Approved Projects', total: Number(pdfReview.approved || 0) },
      {
        label: 'Projects without PDF',
        total: Math.max(Number(pdfReview.totalProjects || 0) - Number(pdfReview.withPdf || 0), 0),
      },
    ];

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        totals: {
          students,
          activeStudents,
          deactivatedStudents,
          supervisors: Number(userReport?.supervisorCount[0]?.total || 0),
          assignedStudents,
          unassignedStudents,
          projects: Number(projectReport?.projectTotals[0]?.total || 0),
          reviewQueue: Number(pdfReview.waitingForReview || 0),
          projectsWithPdf: Number(pdfReview.withPdf || 0),
          finedStudents: Number(outstandingFineSummary?.total || 0),
          totalFineAmount,
        },
        finedStudents,
        collectedFineStudents,
        studentsPerSupervisor,
        studentStatusSummary: toLabelRows(userReport?.studentStatus || [], 'No Status'),
        studentActivitySummary: toLabelRows(userReport?.studentActivity || [], 'Unknown'),
        programSummary: toLabelRows(userReport?.programs || [], 'No Program'),
        batchSummary: toLabelRows(userReport?.batches || [], 'No Batch'),
        projectStatusSummary: toLabelRows(projectReport?.projectStatus || [], 'Pending'),
        projectStageSummary: toLabelRows(projectReport?.projectStage || [], 'PROPOSAL'),
        pdfReviewSummary,
      },
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
