import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import {
  applyPolicyDeadlineChange,
  changePolicyStatus,
  correctFineAmount,
  createFinePolicyVersion,
  createFineRestrictionRule,
  createFineType,
  createManualFines,
  generateLateRegistrationFines,
  initializeFineTypes,
  previewPolicyDeadlineChange,
  setFineRestrictionOverride,
  transitionFineStatus,
} from '../../../../lib/dynamicFineService';
import {
  adjustFine,
  markPaymentUnderVerification,
  previewFineClearance,
  previewFineRestoration,
  previewOfflinePayment,
  recordOfflinePayment,
  rejectFinePayment,
  restoreFineRelationships,
  verifyFinePayment,
  waiveFine,
} from '../../../../lib/dynamicFinePayment';
import {
  applyStructuralFineEnforcement,
  previewStructuralFineEnforcement,
} from '../../../../lib/fineStructuralRestriction';
import connectToDatabase from '../../../../lib/mongodb';
import { requireCurrentUser } from '../../../../lib/security/auth';
import FineAudit from '../../../../models/FineAudit';
import FinePayment from '../../../../models/FinePayment';
import FinePolicy from '../../../../models/FinePolicy';
import FineRestrictionRule from '../../../../models/FineRestrictionRule';
import FineType from '../../../../models/FineType';
import Project from '../../../../models/Project';
import StudentFine from '../../../../models/StudentFine';
import User from '../../../../models/User';
import type {
  FineCalculationMethod,
  FineLiabilityMode,
  FineRestriction,
  FineRestrictionScope,
  FineStatus,
  FineTypeCategory,
} from '../../../../types/fines';

export const dynamic = 'force-dynamic';

const BULK_STUDENT_LIMIT = 5_000;
const MAX_PAGE_SIZE = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, maximumLength = 1_000) {
  return String(value || '').trim().slice(0, maximumLength);
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    : [];
}

function isFineRestriction(value: unknown): value is FineRestriction {
  return (
    value === 'pdf-upload-student' ||
    value === 'pdf-upload-team' ||
    value === 'login-payment-only' ||
    value === 'login-complete' ||
    value === 'supervisor-selection' ||
    value === 'supervisor-disband-project' ||
    value === 'supervisor-detach-student' ||
    value === 'team-membership' ||
    value === 'none'
  );
}

function restrictions(value: unknown) {
  if (!Array.isArray(value) || !value.every(isFineRestriction)) {
    throw new Error('Restrictions must contain only supported restriction types.');
  }
  return value;
}

function fineTypeCategory(value: unknown): FineTypeCategory {
  if (value === 'late-registration' || value === 'late-submission' || value === 'manual') return value;
  throw new Error('Fine type category is invalid.');
}

function calculationMethod(value: unknown): FineCalculationMethod {
  if (value === 'fixed' || value === 'daily' || value === 'starting-plus-daily') return value;
  throw new Error('Fine calculation method is invalid.');
}

function liabilityMode(value: unknown): FineLiabilityMode {
  if (value === 'all-members' || value === 'shared-team') return value;
  return 'individual';
}

function restrictionScope(value: unknown): FineRestrictionScope {
  if (
    value === 'global' ||
    value === 'fine-type' ||
    value === 'program-batch' ||
    value === 'project-team' ||
    value === 'student' ||
    value === 'fine-record'
  ) return value;
  throw new Error('Restriction scope is invalid.');
}

function fineStatus(value: unknown): FineStatus {
  if (
    value === 'scheduled' ||
    value === 'accruing' ||
    value === 'paused' ||
    value === 'pending-payment' ||
    value === 'payment-submitted' ||
    value === 'under-verification' ||
    value === 'paid' ||
    value === 'waived' ||
    value === 'cancelled' ||
    value === 'disputed'
  ) return value;
  throw new Error('Fine status is invalid.');
}

function calculation(value: unknown) {
  if (!isRecord(value)) throw new Error('Fine calculation is required.');
  return {
    method: calculationMethod(value.method),
    fixedAmount: Number(value.fixedAmount || 0),
    startingAmount: Number(value.startingAmount || 0),
    dailyAmount: Number(value.dailyAmount || 0),
    maximumAmount: value.maximumAmount == null ? null : Number(value.maximumAmount),
  };
}

async function requestBody(req: NextRequest) {
  const value: unknown = await req.json();
  if (!isRecord(value)) throw new Error('A JSON object is required.');
  return value;
}

async function requireAdmin(req: NextRequest) {
  return requireCurrentUser(req, ['admin']);
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.min(Math.max(number, minimum), maximum) : fallback;
}

async function resolveManualTargets(value: unknown) {
  if (!isRecord(value)) throw new Error('Manual fine target is required.');
  const scope = text(value.scope, 40);
  let query: Record<string, unknown> = { role: 'student', isActive: true };
  if (scope === 'student' || scope === 'students') {
    const ids = stringList(value.studentIds);
    if (ids.length === 0 || !ids.every(mongoose.Types.ObjectId.isValid)) {
      throw new Error('Select at least one valid student.');
    }
    query = { ...query, _id: { $in: ids } };
  } else if (scope === 'project-team') {
    const projectId = text(value.projectId, 64);
    if (!mongoose.Types.ObjectId.isValid(projectId)) throw new Error('Project target is invalid.');
    query = { ...query, projectId };
  } else if (scope === 'program') {
    query = { ...query, program: text(value.program, 32) };
  } else if (scope === 'batch') {
    query = { ...query, batch: text(value.batch, 40) };
  } else if (scope !== 'all-active') {
    throw new Error('Manual fine target scope is invalid.');
  }
  const students = await User.find(query).select('_id').limit(BULK_STUDENT_LIMIT + 1).lean();
  if (students.length > BULK_STUDENT_LIMIT) {
    throw new Error(`Manual fine target exceeds the ${BULK_STUDENT_LIMIT}-student safety limit.`);
  }
  return students.map((student) => String(student._id));
}

export async function GET(req: NextRequest) {
  try {
    if (!await requireAdmin(req)) {
      return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
    }
    const studentId = text(req.nextUrl.searchParams.get('studentId'), 64);
    if (studentId && !mongoose.Types.ObjectId.isValid(studentId)) {
      return NextResponse.json({ error: 'Student filter is invalid.' }, { status: 400 });
    }
    const page = boundedInteger(req.nextUrl.searchParams.get('page'), 1, 1, 1_000_000);
    const limit = boundedInteger(req.nextUrl.searchParams.get('limit'), 25, 1, MAX_PAGE_SIZE);
    const auditPage = boundedInteger(req.nextUrl.searchParams.get('auditPage'), 1, 1, 1_000_000);
    const search = text(req.nextUrl.searchParams.get('search'), 80);
    const program = text(req.nextUrl.searchParams.get('program'), 32);
    const batch = text(req.nextUrl.searchParams.get('batch'), 40);
    const status = text(req.nextUrl.searchParams.get('status'), 40);
    const fineTypeId = text(req.nextUrl.searchParams.get('fineTypeId'), 64);
    const restriction = text(req.nextUrl.searchParams.get('restriction'), 80);
    const dateFrom = text(req.nextUrl.searchParams.get('dateFrom'), 40);
    const dateTo = text(req.nextUrl.searchParams.get('dateTo'), 40);
    const projectId = text(req.nextUrl.searchParams.get('projectId'), 64);
    const supervisorId = text(req.nextUrl.searchParams.get('supervisorId'), 64);
    const studentFilter: Record<string, unknown> = { role: 'student' };
    if (studentId) studentFilter._id = studentId;
    if (program) studentFilter.program = program;
    if (batch) studentFilter.batch = batch;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      studentFilter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { rollNo: { $regex: `^${escaped}$`, $options: 'i' } },
      ];
    }
    const filteredStudentIds = studentId || program || batch || search
      ? (await User.find(studentFilter).select('_id').limit(BULK_STUDENT_LIMIT).lean())
          .map((student) => student._id)
      : null;
    const fineQuery: Record<string, unknown> = {};
    if (filteredStudentIds) fineQuery.studentId = { $in: filteredStudentIds };
    if (status && status !== 'all') fineQuery.status = status;
    if (fineTypeId) {
      if (!mongoose.Types.ObjectId.isValid(fineTypeId)) throw new Error('Fine type filter is invalid.');
      fineQuery.fineTypeId = fineTypeId;
    }
    if (restriction) {
      fineQuery.$or = [
        { policyRestrictions: restriction },
        { restrictionOverrideEnabled: true, restrictionOverride: restriction },
      ];
    }
    if (projectId) {
      if (!mongoose.Types.ObjectId.isValid(projectId)) throw new Error('Project filter is invalid.');
      fineQuery.projectId = projectId;
    }
    if (supervisorId) {
      if (!mongoose.Types.ObjectId.isValid(supervisorId)) throw new Error('Supervisor filter is invalid.');
      const projectIds = await Project.distinct('_id', { supervisorId });
      fineQuery.projectId = { $in: projectIds };
    }
    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (Number.isNaN(from.getTime())) throw new Error('Start date filter is invalid.');
        createdAt.$gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (Number.isNaN(to.getTime())) throw new Error('End date filter is invalid.');
        createdAt.$lte = to;
      }
      fineQuery.createdAt = createdAt;
    }

    const unresolvedStatuses = ['paid', 'waived', 'cancelled'];
    const adjustedAmountStage = {
      $set: {
        adjustedAmount: {
          $max: [
            {
              $add: [
                '$currentAmount',
                {
                  $reduce: {
                    input: { $ifNull: ['$adjustments', []] },
                    initialValue: 0,
                    in: {
                      $add: [
                        '$$value',
                        {
                          $cond: [
                            { $eq: ['$$this.kind', 'charge'] },
                            '$$this.amount',
                            { $multiply: ['$$this.amount', -1] },
                          ],
                        },
                      ],
                    },
                  },
                },
              ],
            },
            0,
          ],
        },
      },
    };
    const [fineTypes, policies, rules, fines, fineCount, audits, auditCount, payments, overviewRows, reportRows] = await Promise.all([
      FineType.find().sort({ name: 1 }).lean(),
      FinePolicy.find().sort({ createdAt: -1 }).limit(200).lean(),
      FineRestrictionRule.find({ active: true }).sort({ createdAt: -1 }).limit(200).lean(),
      StudentFine.find(fineQuery)
        .populate('studentId', 'name rollNo program batch projectId supervisorId isActive')
        .populate('fineTypeId', 'code name category')
        .populate('projectId', 'title supervisorId')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      StudentFine.countDocuments(fineQuery),
      FineAudit.find().populate('actorId', 'name rollNo').sort({ createdAt: -1, _id: -1 })
        .skip((auditPage - 1) * limit).limit(limit).lean(),
      FineAudit.countDocuments(),
      FinePayment.find()
        .populate('studentId', 'name rollNo program batch')
        .sort({ createdAt: 1, _id: 1 })
        .limit(100)
        .lean(),
      StudentFine.aggregate([
        adjustedAmountStage,
        {
          $group: {
            _id: '$status',
            amount: { $sum: '$adjustedAmount' },
            settled: { $sum: { $ifNull: ['$settledAmount', 0] } },
            students: { $addToSet: '$studentId' },
            restrictedStudents: {
              $addToSet: {
                $cond: [
                  {
                    $and: [
                      { $not: [{ $in: ['$status', unresolvedStatuses] }] },
                      {
                        $or: [
                          { $gt: [{ $size: { $ifNull: ['$policyRestrictions', []] } }, 0] },
                          { $eq: ['$restrictionOverrideEnabled', true] },
                        ],
                      },
                    ],
                  },
                  '$studentId',
                  null,
                ],
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      StudentFine.aggregate([
        { $match: fineQuery },
        adjustedAmountStage,
        {
          $group: {
            _id: { fineTypeId: '$fineTypeId', status: '$status' },
            count: { $sum: 1 },
            amount: { $sum: '$adjustedAmount' },
            settled: { $sum: { $ifNull: ['$settledAmount', 0] } },
          },
        },
        { $sort: { '_id.fineTypeId': 1, '_id.status': 1 } },
      ]),
    ]);
    const statusOverview = new Map(overviewRows.map((row) => [String(row._id), row]));
    const unresolvedRows = overviewRows.filter((row) => !unresolvedStatuses.includes(String(row._id)));
    const outstandingAmount = unresolvedRows.reduce(
      (total, row) => total + Math.max(Number(row.amount || 0) - Number(row.settled || 0), 0),
      0
    );
    const finedStudents = new Set(unresolvedRows.flatMap((row) => row.students.map(String))).size;
    const restrictedStudents = new Set(
      unresolvedRows.flatMap((row) => row.restrictedStudents.filter(Boolean).map(String))
    ).size;
    return NextResponse.json(
      {
        overview: {
          outstandingAmount,
          collectedAmount: Number(statusOverview.get('paid')?.settled || 0),
          waivedAmount: Number(statusOverview.get('waived')?.amount || 0),
          finedStudents,
          restrictedStudents,
          activePolicies: policies.filter((policy) => policy.status === 'active').length,
          pendingPaymentVerifications: payments.filter(
            (payment) => payment.status === 'submitted' || payment.status === 'under-verification'
          ).length,
          loginBlocked: await StudentFine.countDocuments({
            status: { $nin: unresolvedStatuses },
            $or: [
              { policyRestrictions: { $in: ['login-payment-only', 'login-complete'] } },
              { restrictionOverride: { $in: ['login-payment-only', 'login-complete'] } },
            ],
          }),
          projectsBlocked: await StudentFine.distinct('projectId', {
            projectId: { $ne: null },
            status: { $nin: unresolvedStatuses },
            $or: [
              { policyRestrictions: { $in: ['pdf-upload-student', 'pdf-upload-team'] } },
              { restrictionOverride: { $in: ['pdf-upload-student', 'pdf-upload-team'] } },
            ],
          }).then((ids) => ids.length),
        },
        fineTypes,
        policies,
        restrictionRules: rules,
        fines,
        payments,
        audits,
        report: reportRows,
        filters: { studentId, search, program, batch, status, fineTypeId, restriction, dateFrom, dateTo, projectId, supervisorId },
        pagination: {
          page,
          limit,
          total: fineCount,
          totalPages: Math.max(Math.ceil(fineCount / limit), 1),
          auditPage,
          auditTotal: auditCount,
          auditTotalPages: Math.max(Math.ceil(auditCount / limit), 1),
        },
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('fine_system_read_failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load the fine system.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
    const body = await requestBody(req);
    const action = text(body.action, 80);

    if (action === 'initializeFineTypes') {
      return NextResponse.json(await initializeFineTypes(admin.id), { status: 201 });
    }
    if (action === 'createFineType') {
      const result = await createFineType({
        code: text(body.code, 80),
        name: text(body.name, 120),
        description: text(body.description, 1_000),
        category: fineTypeCategory(body.category),
        defaultRestrictions: restrictions(body.defaultRestrictions || ['none']),
      }, admin.id);
      return NextResponse.json({ fineType: result }, { status: 201 });
    }
    if (action === 'createPolicy') {
      const trigger = fineTypeCategory(body.trigger);
      const result = await createFinePolicyVersion({
        fineTypeId: text(body.fineTypeId, 64),
        trigger,
        deadline: body.deadline == null ? null : text(body.deadline, 80),
        gracePeriodDays: Number(body.gracePeriodDays || 0),
        timeZone: text(body.timeZone, 80) || 'Asia/Karachi',
        calculation: calculation(body.calculation),
        applicablePrograms: stringList(body.applicablePrograms),
        applicableBatches: stringList(body.applicableBatches),
        effectiveFrom: text(body.effectiveFrom, 80),
        submissionStage: text(body.submissionStage, 80) || null,
        liabilityMode: liabilityMode(body.liabilityMode),
        acceptedSubmissionStopsAccrual: body.acceptedSubmissionStopsAccrual !== false,
        rejectedSubmissionMode:
          body.rejectedSubmissionMode === 'resume-on-rejection' ||
          body.rejectedSubmissionMode === 'reset-from-resubmission'
            ? body.rejectedSubmissionMode
            : 'continue',
        disputesAllowed: body.disputesAllowed !== false,
        defaultRestrictions: restrictions(body.defaultRestrictions || ['none']),
      }, admin.id);
      return NextResponse.json({ policy: result }, { status: 201 });
    }
    if (action === 'createRestrictionRule') {
      if (body.confirm !== true) throw new Error('Restriction changes require an impact preview and explicit confirmation.');
      const result = await createFineRestrictionRule({
        scope: restrictionScope(body.scope),
        label: text(body.label, 160),
        restrictions: restrictions(body.restrictions),
        fineTypeId: text(body.fineTypeId, 64) || null,
        program: text(body.program, 32) || null,
        batch: text(body.batch, 40) || null,
        projectId: text(body.projectId, 64) || null,
        studentId: text(body.studentId, 64) || null,
        fineRecordId: text(body.fineRecordId, 64) || null,
      }, admin.id);
      return NextResponse.json({ restrictionRule: result }, { status: 201 });
    }
    if (action === 'previewRestrictionRule') {
      await connectToDatabase();
      const scope = restrictionScope(body.scope);
      const query: Record<string, unknown> = { status: { $nin: ['paid', 'waived', 'cancelled'] } };
      if (scope === 'fine-type') query.fineTypeId = text(body.fineTypeId, 64);
      if (scope === 'student') query.studentId = text(body.studentId, 64);
      if (scope === 'fine-record') query._id = text(body.fineRecordId, 64);
      if (scope === 'project-team') query.projectId = text(body.projectId, 64);
      if (scope === 'program-batch') {
        const students = await User.find({
          role: 'student',
          ...(text(body.program, 32) ? { program: text(body.program, 32) } : {}),
          ...(text(body.batch, 40) ? { batch: text(body.batch, 40) } : {}),
        }).select('_id').limit(BULK_STUDENT_LIMIT).lean();
        query.studentId = { $in: students.map((student) => student._id) };
      }
      const [affectedFines, affectedStudentIds] = await Promise.all([
        StudentFine.countDocuments(query),
        StudentFine.distinct('studentId', query),
      ]);
      return NextResponse.json({
        preview: {
          affectedFines,
          affectedStudents: affectedStudentIds.length,
          restrictions: restrictions(body.restrictions),
        },
      });
    }
    if (action === 'createManualFine') {
      if (body.confirm !== true) throw new Error('Manual bulk fine creation requires an impact preview and explicit confirmation.');
      await connectToDatabase();
      const studentIds = await resolveManualTargets(body.target);
      const created = await createManualFines({
        fineTypeId: text(body.fineTypeId, 64),
        studentIds,
        title: text(body.title, 120),
        reason: text(body.reason, 1_000),
        amount: Number(body.amount),
        dueDate: text(body.dueDate, 80),
        notes: text(body.notes, 4_000),
        restrictions: restrictions(body.restrictions || ['none']),
        accumulationEnabled: body.accumulationEnabled === true,
        dailyAmount: Number(body.dailyAmount || 0),
        disputesAllowed: body.disputesAllowed !== false,
        generationKey: text(body.idempotencyKey, 160),
        actorId: admin.id,
      });
      return NextResponse.json({ created: created.length }, { status: 201 });
    }
    if (action === 'generateLateRegistrationFines') {
      await connectToDatabase();
      const students = await User.find({ role: 'student', isActive: true })
        .select('_id program batch projectId createdAt lateRegistrationFine')
        .limit(BULK_STUDENT_LIMIT + 1);
      if (students.length > BULK_STUDENT_LIMIT) {
        throw new Error(`Generation exceeds the ${BULK_STUDENT_LIMIT}-student safety limit.`);
      }
      let created = 0;
      let legacySkipped = 0;
      for (const student of students) {
        if (Number(student.lateRegistrationFine || 0) > 0) {
          legacySkipped += 1;
          continue;
        }
        created += (await generateLateRegistrationFines({
          id: String(student._id),
          program: student.program,
          batch: student.batch,
          projectId: student.projectId ? String(student.projectId) : null,
        }, student.createdAt || new Date())).length;
      }
      return NextResponse.json({ processed: students.length, generated: created, legacySkipped });
    }
    if (action === 'previewDeadlineChange') {
      const preview = await previewPolicyDeadlineChange(
        text(body.policyId, 64),
        text(body.newDeadline, 80),
        stringList(body.selectedStudentIds)
      );
      return NextResponse.json({ preview });
    }
    if (action === 'previewManualFine') {
      await connectToDatabase();
      const studentIds = await resolveManualTargets(body.target);
      return NextResponse.json({
        preview: {
          affectedStudents: studentIds.length,
          totalAmount: studentIds.length * Number(body.amount || 0),
          restrictions: restrictions(body.restrictions || ['none']),
          studentIds: studentIds.slice(0, 100),
          truncated: studentIds.length > 100,
        },
      });
    }
    if (action === 'previewPaymentClearance') {
      return NextResponse.json({
        preview: await previewFineClearance(
          text(body.paymentId, 64),
          stringList(body.fineIds)
        ),
      });
    }
    if (action === 'previewRestoration') {
      return NextResponse.json({ preview: await previewFineRestoration(text(body.fineId, 64)) });
    }
    if (action === 'previewOfflinePayment') {
      return NextResponse.json({
        preview: await previewOfflinePayment(
          text(body.studentId, 64),
          stringList(body.fineIds),
          Number(body.paidAmount)
        ),
      });
    }
    if (action === 'recordOfflinePayment') {
      if (body.confirm !== true) throw new Error('Offline payment recording requires explicit confirmation.');
      return NextResponse.json({
        result: await recordOfflinePayment({
          studentId: text(body.studentId, 64),
          fineIds: stringList(body.fineIds),
          reference: text(body.reference, 160),
          paidAmount: Number(body.paidAmount),
          paymentDate: text(body.paymentDate, 80),
          message: text(body.message, 1_000),
          idempotencyKey: text(body.idempotencyKey, 128),
          actorId: admin.id,
          reason: text(body.reason, 1_000),
        }),
      }, { status: 201 });
    }
    if (action === 'previewStructuralEnforcement') {
      return NextResponse.json({ preview: await previewStructuralFineEnforcement(text(body.fineId, 64)) });
    }
    if (action === 'applyStructuralEnforcement') {
      if (body.confirm !== true) throw new Error('Structural enforcement requires explicit confirmation.');
      const result = await applyStructuralFineEnforcement(
        text(body.fineId, 64),
        admin.id,
        text(body.reason, 1_000)
      );
      return NextResponse.json({ applied: result });
    }
    return NextResponse.json({ error: 'Unsupported fine-system action.' }, { status: 400 });
  } catch (error) {
    console.error('fine_system_create_failed');
    const status = error instanceof mongoose.mongo.MongoServerError && error.code === 11000 ? 409 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update the fine system.' },
      { status }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
    const body = await requestBody(req);
    const action = text(body.action, 80);
    if (action === 'changePolicyStatus') {
      const status = body.status;
      if (status !== 'active' && status !== 'paused' && status !== 'inactive') {
        throw new Error('Policy status is invalid.');
      }
      return NextResponse.json({
        policy: await changePolicyStatus(
          text(body.policyId, 64),
          status,
          admin.id,
          text(body.reason, 1_000)
        ),
      });
    }
    if (action === 'startPaymentReview') {
      return NextResponse.json({
        payment: await markPaymentUnderVerification(text(body.paymentId, 64), admin.id),
      });
    }
    if (action === 'verifyPaymentAndClear') {
      if (body.confirm !== true) throw new Error('Payment clearance requires preview and explicit confirmation.');
      return NextResponse.json({
        result: await verifyFinePayment({
          paymentId: text(body.paymentId, 64),
          fineIds: stringList(body.fineIds),
          actorId: admin.id,
          reason: text(body.reason, 1_000),
        }),
      });
    }
    if (action === 'rejectPayment') {
      return NextResponse.json({
        payment: await rejectFinePayment(
          text(body.paymentId, 64),
          admin.id,
          text(body.reason, 1_000)
        ),
      });
    }
    if (action === 'waiveFine') {
      if (body.confirm !== true) throw new Error('Fine waiver requires explicit confirmation.');
      return NextResponse.json({
        fine: await waiveFine(text(body.fineId, 64), admin.id, text(body.reason, 1_000)),
      });
    }
    if (action === 'adjustFine') {
      if (body.confirm !== true) throw new Error('Fine adjustment requires explicit confirmation.');
      const kind = body.kind;
      if (kind !== 'discount' && kind !== 'charge') throw new Error('Adjustment type is invalid.');
      return NextResponse.json({
        fine: await adjustFine(
          text(body.fineId, 64),
          kind,
          Number(body.amount),
          admin.id,
          text(body.reason, 1_000)
        ),
      });
    }
    if (action === 'restoreRelationships') {
      if (body.confirm !== true) throw new Error('Relationship restoration requires preview and explicit confirmation.');
      const mode = body.mode;
      if (mode !== 'team' && mode !== 'supervisor' && mode !== 'both' && mode !== 'leave-unassigned') {
        throw new Error('Restoration mode is invalid.');
      }
      return NextResponse.json({
        restored: await restoreFineRelationships(
          text(body.fineId, 64),
          mode,
          admin.id,
          text(body.reason, 1_000)
        ),
      });
    }
    if (action === 'transitionFineStatus') {
      return NextResponse.json({
        fine: await transitionFineStatus(
          text(body.fineId, 64),
          fineStatus(body.status),
          admin.id,
          text(body.reason, 1_000)
        ),
      });
    }
    if (action === 'setFineRestrictionOverride') {
      return NextResponse.json({
        fine: await setFineRestrictionOverride(
          text(body.fineId, 64),
          body.restrictions == null ? null : restrictions(body.restrictions),
          admin.id,
          text(body.reason, 1_000)
        ),
      });
    }
    if (action === 'correctFineAmount') {
      if (body.confirm !== true) throw new Error('Fine correction requires explicit confirmation.');
      return NextResponse.json({
        fine: await correctFineAmount(
          text(body.fineId, 64),
          Number(body.currentAmount),
          admin.id,
          text(body.reason, 1_000)
        ),
      });
    }
    if (action === 'applyDeadlineChange') {
      const mode = body.mode;
      if (mode === 'preview-only') {
        return NextResponse.json({
          preview: await previewPolicyDeadlineChange(
            text(body.policyId, 64),
            text(body.newDeadline, 80),
            stringList(body.selectedStudentIds)
          ),
        });
      }
      if (mode !== 'new-students-only' && mode !== 'all-unresolved' && mode !== 'selected-students') {
        throw new Error('Deadline application mode is invalid.');
      }
      if (body.confirm !== true) throw new Error('Deadline changes require a preview and explicit confirmation.');
      return NextResponse.json({
        preview: await applyPolicyDeadlineChange({
          policyId: text(body.policyId, 64),
          newDeadline: text(body.newDeadline, 80),
          mode,
          selectedStudentIds: stringList(body.selectedStudentIds),
          actorId: admin.id,
          reason: text(body.reason, 1_000),
        }),
      });
    }
    return NextResponse.json({ error: 'Unsupported fine-system action.' }, { status: 400 });
  } catch (error) {
    console.error('fine_system_update_failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update the fine system.' },
      { status: 400 }
    );
  }
}
