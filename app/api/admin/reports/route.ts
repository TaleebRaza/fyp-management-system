import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import Project from '../../../../models/Project';
import {
  buildCollectedFineSummary,
  buildFineRestriction,
  COLLECTED_STUDENT_FINE_FILTER,
  OUTSTANDING_STUDENT_FINE_FILTER,
  type FineRestrictedUser,
} from '../../../../lib/fineRestriction';
import { requireCurrentUser } from '../../../../lib/security/auth';

export const dynamic = 'force-dynamic';

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

const REVIEWED_PROJECT_STATUSES = ['Approved', 'Rejected', 'Changes Requested'];

export async function GET(req: NextRequest) {
  try {
    if (!await requireCurrentUser(req, ['admin'])) {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
    }

    await connectToDatabase();

    const [
      supervisors,
      studentsPerSupervisorRaw,
      studentStatusRaw,
      studentActivityRaw,
      programRaw,
      batchRaw,
      projectStatusRaw,
      projectStageRaw,
      finedStudentsRaw,
      collectedFineStudentsRaw,
      pdfReviewRaw,
      totalsRaw,
    ] = await Promise.all([
      User.find({ role: 'supervisor' }).select('_id name rollNo').lean(),

      User.aggregate([
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
            active: {
              $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] },
            },
            deactivated: {
              $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] },
            },
          },
        },
        { $sort: { total: -1 } },
      ]),

      User.aggregate([
        { $match: { role: 'student' } },
        { $group: { _id: { $ifNull: ['$status', 'No Status'] }, total: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),

      User.aggregate([
        { $match: { role: 'student' } },
        {
          $group: {
            _id: { $cond: [{ $eq: ['$isActive', false] }, 'Deactivated', 'Active'] },
            total: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),

      User.aggregate([
        { $match: { role: 'student' } },
        { $group: { _id: { $ifNull: ['$program', 'No Program'] }, total: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),

      User.aggregate([
        { $match: { role: 'student' } },
        { $group: { _id: { $ifNull: ['$batch', 'No Batch'] }, total: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),

      Project.aggregate([
        { $group: { _id: { $ifNull: ['$status', 'Pending'] }, total: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),

      Project.aggregate([
        { $group: { _id: { $ifNull: ['$stage', 'PROPOSAL'] }, total: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),

      User.find(OUTSTANDING_STUDENT_FINE_FILTER)
        .select(
          'name rollNo program batch lateRegistrationDays lateRegistrationFine lateRegistrationFineStatus registrationPunishment'
        )
        .sort({ createdAt: -1 })
        .lean(),

      User.find(COLLECTED_STUDENT_FINE_FILTER)
        .select(
          'name rollNo program batch lateRegistrationDays lateRegistrationFine lateRegistrationFineStatus registrationPunishment'
        )
        .sort({ createdAt: -1 })
        .lean(),

      Project.aggregate([
        {
          $group: {
            _id: null,
            totalProjects: { $sum: 1 },
            withPdf: {
              $sum: {
                $cond: [
                  { $gt: [{ $strLenCP: { $ifNull: ['$pdfUrl', ''] } }, 0] },
                  1,
                  0,
                ],
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
              $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] },
            },
          },
        },
      ]),

      Promise.all([
        User.aggregate([
          { $match: { role: 'student' } },
          {
            $group: {
              _id: null,
              students: { $sum: 1 },
              activeStudents: {
                $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] },
              },
              deactivatedStudents: {
                $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] },
              },
              assignedStudents: {
                $sum: {
                  $cond: [
                    { $eq: [{ $type: '$supervisorId' }, 'objectId'] },
                    1,
                    0,
                  ],
                },
              },
              unassignedStudents: {
                $sum: {
                  $cond: [
                    { $ne: [{ $type: '$supervisorId' }, 'objectId'] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),
        User.countDocuments({ role: 'supervisor' }),
        Project.countDocuments({}),
      ]),
    ]);

    const supervisorMap = new Map(
      (supervisors as SupervisorRow[]).map((supervisor) => [
        String(supervisor._id),
        supervisor.name || supervisor.rollNo || 'Unknown Supervisor',
      ])
    );

    const supervisorRows = (supervisors as SupervisorRow[]).map((supervisor) => {
      const raw = (studentsPerSupervisorRaw as SupervisorCountRow[]).find((item) => String(item._id) === String(supervisor._id));

      return {
        supervisorId: String(supervisor._id),
        label: supervisor.name || supervisor.rollNo || 'Unknown Supervisor',
        total: Number(raw?.total || 0),
        active: Number(raw?.active || 0),
        deactivated: Number(raw?.deactivated || 0),
      };
    });

    const extraRows = (studentsPerSupervisorRaw as SupervisorCountRow[])
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
    const pdfReview = pdfReviewRaw[0] || { totalProjects: 0, withPdf: 0, waitingForReview: 0, approved: 0 };
    const [studentTotalsRaw, supervisorCount, projects] = totalsRaw;
    const studentTotals = Array.isArray(studentTotalsRaw) && studentTotalsRaw.length > 0
      ? studentTotalsRaw[0]
      : { students: 0, activeStudents: 0, deactivatedStudents: 0, assignedStudents: 0, unassignedStudents: 0 };
    const finedStudents = (finedStudentsRaw as FinedStudentRecord[]).flatMap((student) => {
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

      return [
        {
          label: `${student.name || 'Unknown Student'} (${student.rollNo || 'No Roll No'})`,
          fineAmount: restriction.totalAmount,
          daysLate: restriction.lateRegistrationFine?.daysLate || 0,
          lateFineAmount: restriction.lateRegistrationFine?.amount || 0,
          adminFineAmount: restriction.adminFine?.amount || 0,
          fineBreakdown: breakdown.join(' + '),
          program: student.program || 'No Program',
          batch: student.batch || 'No Batch',
        },
      ];
    });
    const totalFineAmount = finedStudents.reduce((sum, student) => sum + student.fineAmount, 0);
    const collectedFineStudents = (collectedFineStudentsRaw as FinedStudentRecord[]).flatMap((student) => {
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

      return [
        {
          label: `${student.name || 'Unknown Student'} (${student.rollNo || 'No Roll No'})`,
          fineAmount: collection.totalAmount,
          daysLate: collection.lateRegistrationFine?.daysLate || 0,
          fineBreakdown: breakdown.join(' + '),
          program: student.program || 'No Program',
          batch: student.batch || 'No Batch',
        },
      ];
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
          supervisors: supervisorCount,
          assignedStudents,
          unassignedStudents,
          projects,
          reviewQueue: Number(pdfReview.waitingForReview || 0),
          projectsWithPdf: Number(pdfReview.withPdf || 0),
          finedStudents: finedStudents.length,
          totalFineAmount,
        },
        finedStudents,
        collectedFineStudents,
        studentsPerSupervisor,
        studentStatusSummary: toLabelRows(studentStatusRaw, 'No Status'),
        studentActivitySummary: toLabelRows(studentActivityRaw, 'Unknown'),
        programSummary: toLabelRows(programRaw, 'No Program'),
        batchSummary: toLabelRows(batchRaw, 'No Batch'),
        projectStatusSummary: toLabelRows(projectStatusRaw, 'Pending'),
        projectStageSummary: toLabelRows(projectStageRaw, 'PROPOSAL'),
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
