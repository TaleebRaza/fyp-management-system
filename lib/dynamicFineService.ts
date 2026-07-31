import mongoose, { type ClientSession } from 'mongoose';
import FineAudit from '../models/FineAudit';
import FinePolicy from '../models/FinePolicy';
import FineRestrictionRule from '../models/FineRestrictionRule';
import FineType from '../models/FineType';
import StudentFine from '../models/StudentFine';
import User from '../models/User';
import { enqueueNotificationEmail } from './emailOutbox';
import {
  applyLiabilityShare,
  assertFineStatusTransition,
  buildFineDeduplicationKey,
  calculateFine,
  fineStatusForCalculation,
  isTerminalFineStatus,
  normalizeRestrictionSet,
  nextFinePolicyVersion,
  policyAppliesToStudent,
  previewDeadlineChange,
  resolveLiabilityShares,
} from './finePolicyEngine';
import type {
  FineAdjustmentKind,
  FineCalculation,
  FineLiabilityMode,
  FineRestriction,
  FineRestrictionScope,
  FineStatus,
  FineTypeCategory,
} from '../types/fines';

type Actor = string | null;

type StudentIdentity = {
  id: string;
  program?: string | null;
  batch?: string | null;
  projectId?: string | null;
};

type CreateFineTypeInput = {
  code: string;
  name: string;
  description?: string;
  category: FineTypeCategory;
  defaultRestrictions?: FineRestriction[];
};

type CreateFinePolicyInput = {
  fineTypeId: string;
  trigger: FineTypeCategory;
  deadline?: Date | string | number | null;
  gracePeriodDays?: number;
  timeZone?: string;
  calculation: FineCalculation;
  applicablePrograms?: string[];
  applicableBatches?: string[];
  effectiveFrom: Date | string | number;
  submissionStage?: string | null;
  liabilityMode?: FineLiabilityMode;
  acceptedSubmissionStopsAccrual?: boolean;
  rejectedSubmissionMode?: 'continue' | 'resume-on-rejection' | 'reset-from-resubmission';
  disputesAllowed?: boolean;
  defaultRestrictions?: FineRestriction[];
};

type CreateRestrictionRuleInput = {
  scope: FineRestrictionScope;
  label: string;
  restrictions: FineRestriction[];
  fineTypeId?: string | null;
  program?: string | null;
  batch?: string | null;
  projectId?: string | null;
  studentId?: string | null;
  fineRecordId?: string | null;
};

type GenerateFineInput = {
  policy: typeof FinePolicy.prototype;
  fineType: typeof FineType.prototype;
  student: StudentIdentity;
  reason: string;
  title?: string;
  eventAt: Date | string | number;
  projectId?: string | null;
  projectStage?: string | null;
  relevantStudentIds?: string[];
  generationKey: string;
  calculationOverride?: FineCalculation;
  deadlineOverride?: Date | string | number;
  liabilityMode?: FineLiabilityMode;
  liabilityShareNumerator?: number;
  liabilityShareDenominator?: number;
  liabilityShareIndex?: number;
  administrativeNotes?: string;
  imposedAmount?: number;
  actorId?: Actor;
  session?: ClientSession;
};

type ManualFineInput = {
  fineTypeId: string;
  studentIds: string[];
  title: string;
  reason: string;
  amount: number;
  dueDate: Date | string | number;
  notes?: string;
  restrictions?: FineRestriction[];
  accumulationEnabled?: boolean;
  dailyAmount?: number;
  disputesAllowed?: boolean;
  generationKey: string;
  actorId: string;
};

type FineHistoryInput = {
  action: string;
  details: string;
  actorId: Actor;
  at?: Date;
};

export const INITIAL_FINE_TYPES: readonly Omit<CreateFineTypeInput, 'defaultRestrictions'>[] = [
  {
    code: 'LATE_REGISTRATION',
    name: 'Late Registration Fine',
    description: 'Fine imposed when a student registers after the configured registration deadline.',
    category: 'late-registration',
  },
  {
    code: 'LATE_PDF_SUBMISSION',
    name: 'Late PDF Submission Fine',
    description: 'Fine imposed for project documents accepted after a stage deadline.',
    category: 'late-submission',
  },
  {
    code: 'MANUAL_ADMINISTRATIVE',
    name: 'Manual Administrative Fine',
    description: 'Fine assigned explicitly by an administrator.',
    category: 'manual',
  },
];

function objectId(value: string, label: string) {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new Error(`${label} is invalid.`);
  return new mongoose.Types.ObjectId(value);
}

function requiredText(value: unknown, label: string, maximumLength: number) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text.slice(0, maximumLength);
}

function optionalText(value: unknown, maximumLength: number) {
  return String(value || '').trim().slice(0, maximumLength);
}

function escapeHtml(value: unknown) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function nonNegativeInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be zero or greater.`);
  return Math.round(number);
}

function validDate(value: Date | string | number, label: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`);
  return date;
}

function fineHistory({ action, details, actorId, at = new Date() }: FineHistoryInput) {
  return { action, details, actorId, at };
}

async function recordAudit(
  entityType: 'fine-type' | 'policy' | 'fine-record' | 'restriction-rule',
  entityId: unknown,
  action: string,
  details: string,
  actorId: Actor,
  session?: ClientSession
) {
  const audit = new FineAudit({ entityType, entityId, action, details, actorId });
  await audit.save({ session });
}

async function withTransaction<T>(work: (session: ClientSession) => Promise<T>) {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    if (result === undefined) throw new Error('Fine transaction returned no result.');
    return result;
  } finally {
    await session.endSession();
  }
}

function calculationSnapshot(policy: typeof FinePolicy.prototype, override?: FineCalculation) {
  const calculation = override || policy.calculation;
  return {
    method: calculation.method,
    fixedAmount: nonNegativeInteger(calculation.fixedAmount || 0, 'Fixed amount'),
    startingAmount: nonNegativeInteger(calculation.startingAmount || 0, 'Starting amount'),
    dailyAmount: nonNegativeInteger(calculation.dailyAmount || 0, 'Daily amount'),
    maximumAmount: calculation.maximumAmount == null
      ? null
      : nonNegativeInteger(calculation.maximumAmount, 'Maximum amount'),
    timeZone: requiredText(policy.timeZone || 'Asia/Karachi', 'Time zone', 80),
  };
}

function fineCalculationInput(fine: typeof StudentFine.prototype, effectiveAt: Date) {
  return {
    ...fine.calculation.toObject(),
    deadline: fine.deadline,
    effectiveAt,
    gracePeriodDays: fine.gracePeriodDays,
    pausePeriods: fine.pausePeriods,
    accrualStoppedAt: fine.accrualStoppedAt,
    imposedAmount: fine.imposedAmount,
  };
}

export async function createFineType(input: CreateFineTypeInput, actorId: string) {
  return withTransaction(async (session) => {
    const restrictions = normalizeRestrictionSet(input.defaultRestrictions || ['none']);
    const fineType = new FineType({
      code: requiredText(input.code, 'Fine type code', 80).replace(/[^A-Za-z0-9_-]/g, '_'),
      name: requiredText(input.name, 'Fine type name', 120),
      description: optionalText(input.description, 1_000),
      category: input.category,
      defaultRestrictions: restrictions,
      createdBy: objectId(actorId, 'Administrator'),
      updatedBy: objectId(actorId, 'Administrator'),
    });
    await fineType.save({ session });
    await recordAudit(
      'fine-type',
      fineType._id,
      'created',
      `Created ${fineType.name} with ${restrictions.join(', ')}.`,
      actorId,
      session
    );
    return fineType;
  });
}

export async function initializeFineTypes(actorId: string) {
  return withTransaction(async (session) => {
    const created: string[] = [];
    for (const input of INITIAL_FINE_TYPES) {
      const result = await FineType.updateOne(
        { code: input.code },
        {
          $setOnInsert: {
            ...input,
            active: true,
            defaultRestrictions: ['none'],
            createdBy: objectId(actorId, 'Administrator'),
            updatedBy: objectId(actorId, 'Administrator'),
          },
        },
        { upsert: true, session }
      );
      if (result.upsertedCount === 1 && result.upsertedId) {
        created.push(input.code);
        await recordAudit(
          'fine-type',
          result.upsertedId,
          'created',
          `Initialized ${input.name}.`,
          actorId,
          session
        );
      }
    }
    return { created, unchanged: INITIAL_FINE_TYPES.length - created.length };
  });
}

export async function createFinePolicyVersion(input: CreateFinePolicyInput, actorId: string) {
  return withTransaction(async (session) => {
    const fineTypeId = objectId(input.fineTypeId, 'Fine type');
    const fineType = await FineType.findOne({ _id: fineTypeId, active: true }).session(session);
    if (!fineType) throw new Error('Active fine type not found.');
    if (fineType.category !== input.trigger) throw new Error('Fine policy trigger must match its fine type.');
    if (input.trigger !== 'manual' && input.deadline == null) {
      throw new Error('Automatic fine policies require a deadline.');
    }

    const latestForStage = await FinePolicy.findOne({
      fineTypeId,
      submissionStage: optionalText(input.submissionStage, 80) || null,
    })
      .sort({ version: -1 })
      .session(session);
    const latestVersion = await FinePolicy.findOne({ fineTypeId })
      .sort({ version: -1 })
      .session(session);
    const version = nextFinePolicyVersion(latestVersion?.version);
    if (latestForStage?.status === 'active' || latestForStage?.status === 'paused') {
      latestForStage.status = 'inactive';
      await latestForStage.save({ session });
      await recordAudit(
        'policy',
        latestForStage._id,
        'superseded',
        `Superseded by policy version ${version}.`,
        actorId,
        session
      );
    }

    const restrictions = normalizeRestrictionSet(
      input.defaultRestrictions || fineType.defaultRestrictions || ['none']
    );
    const calculation = calculationSnapshot(
      { calculation: input.calculation, timeZone: input.timeZone || 'Asia/Karachi' },
      input.calculation
    );
    const policy = new FinePolicy({
      fineTypeId,
      version,
      trigger: input.trigger,
      deadline: input.deadline == null ? null : validDate(input.deadline, 'Deadline'),
      gracePeriodDays: nonNegativeInteger(input.gracePeriodDays || 0, 'Grace period'),
      timeZone: requiredText(input.timeZone || 'Asia/Karachi', 'Time zone', 80),
      calculation,
      applicablePrograms: [...new Set(input.applicablePrograms || [])],
      applicableBatches: [...new Set(input.applicableBatches || [])],
      effectiveFrom: validDate(input.effectiveFrom, 'Effective date'),
      submissionStage: optionalText(input.submissionStage, 80) || null,
      liabilityMode: input.liabilityMode || 'individual',
      acceptedSubmissionStopsAccrual: input.acceptedSubmissionStopsAccrual !== false,
      rejectedSubmissionMode: input.rejectedSubmissionMode || 'continue',
      disputesAllowed: input.disputesAllowed !== false,
      defaultRestrictions: restrictions,
      supersedesPolicyId: latestForStage?._id || null,
      createdBy: objectId(actorId, 'Administrator'),
    });
    await policy.save({ session });
    await recordAudit(
      'policy',
      policy._id,
      'created',
      `Created policy version ${version} for ${fineType.name}.`,
      actorId,
      session
    );
    return policy;
  });
}

export async function createFineRestrictionRule(input: CreateRestrictionRuleInput, actorId: string) {
  return withTransaction(async (session) => {
    const restrictions = normalizeRestrictionSet(input.restrictions);
    if (input.scope === 'fine-type' && !input.fineTypeId) throw new Error('Fine-type rules require a fine type.');
    if (input.scope === 'program-batch' && !input.program && !input.batch) {
      throw new Error('Program or batch is required for a program-batch rule.');
    }
    if (input.scope === 'project-team' && !input.projectId) throw new Error('Project-team rules require a project.');
    if (input.scope === 'student' && !input.studentId) throw new Error('Student rules require a student.');
    if (input.scope === 'fine-record' && !input.fineRecordId) {
      throw new Error('Fine-record rules require a fine record.');
    }
    const matchingRules = await FineRestrictionRule.find({
      active: true,
      scope: input.scope,
      fineTypeId: input.fineTypeId ? objectId(input.fineTypeId, 'Fine type') : null,
      program: optionalText(input.program, 32) || null,
      batch: optionalText(input.batch, 40) || null,
      projectId: input.projectId ? objectId(input.projectId, 'Project') : null,
      studentId: input.studentId ? objectId(input.studentId, 'Student') : null,
      fineRecordId: input.fineRecordId ? objectId(input.fineRecordId, 'Fine record') : null,
    }).session(session);
    normalizeRestrictionSet([
      ...matchingRules.flatMap((rule) => rule.restrictions),
      ...restrictions,
    ]);
    const rule = new FineRestrictionRule({
      scope: input.scope,
      label: requiredText(input.label, 'Restriction rule label', 160),
      restrictions,
      fineTypeId: input.fineTypeId ? objectId(input.fineTypeId, 'Fine type') : null,
      program: optionalText(input.program, 32) || null,
      batch: optionalText(input.batch, 40) || null,
      projectId: input.projectId ? objectId(input.projectId, 'Project') : null,
      studentId: input.studentId ? objectId(input.studentId, 'Student') : null,
      fineRecordId: input.fineRecordId ? objectId(input.fineRecordId, 'Fine record') : null,
      createdBy: objectId(actorId, 'Administrator'),
      updatedBy: objectId(actorId, 'Administrator'),
    });
    await rule.save({ session });
    await recordAudit(
      'restriction-rule',
      rule._id,
      'created',
      `Created ${input.scope} restriction rule with ${restrictions.join(', ')}.`,
      actorId,
      session
    );
    return rule;
  });
}

export async function generateFine(input: GenerateFineInput) {
  const deadline = validDate(input.deadlineOverride || input.policy.deadline, 'Fine deadline');
  const eventAt = validDate(input.eventAt, 'Fine event date');
  const calculation = calculationSnapshot(input.policy, input.calculationOverride);
  const result = calculateFine({
    ...calculation,
    deadline,
    effectiveAt: eventAt,
    gracePeriodDays: input.policy.gracePeriodDays,
    pausePeriods: input.policy.pausePeriods,
    imposedAmount: input.imposedAmount,
  });
  const numerator = input.liabilityShareNumerator || 1;
  const denominator = input.liabilityShareDenominator || 1;
  const shareIndex = input.liabilityShareIndex || 0;
  const sharedOriginalAmount = applyLiabilityShare(result.originalAmount, numerator, denominator, shareIndex);
  const sharedCurrentAmount = applyLiabilityShare(result.currentAmount, numerator, denominator, shareIndex);
  const sharedResult = {
    originalAmount: sharedOriginalAmount,
    currentAmount: sharedCurrentAmount,
    accruedAmount: Math.max(sharedCurrentAmount - sharedOriginalAmount, 0),
    lateDays: result.lateDays,
  };
  const status = fineStatusForCalculation(result, {
    deadline,
    effectiveAt: eventAt,
    gracePeriodDays: input.policy.gracePeriodDays,
    timeZone: calculation.timeZone,
    pausePeriods: input.policy.pausePeriods,
    imposedAmount: nonNegativeInteger(input.imposedAmount || 0, 'Imposed amount'),
  });
  const projectStage = optionalText(input.projectStage, 80) || null;
  const deduplicationKey = buildFineDeduplicationKey({
    studentId: input.student.id,
    fineTypeId: String(input.fineType._id),
    projectStage,
    policyVersion: Number(input.policy.version),
    generationKey: requiredText(input.generationKey, 'Generation key', 160),
  });
  const details = `Generated ${input.fineType.name} under policy version ${input.policy.version}.`;
  const actorId = input.actorId || null;
  const upsert = await StudentFine.updateOne(
    { deduplicationKey },
    {
      $setOnInsert: {
        studentId: objectId(input.student.id, 'Student'),
        fineTypeId: input.fineType._id,
        policyId: input.policy._id,
        policyVersion: input.policy.version,
        title: optionalText(input.title, 120) || input.fineType.name,
        reason: requiredText(input.reason, 'Fine reason', 1_000),
        ...sharedResult,
        deadline,
        gracePeriodDays: input.policy.gracePeriodDays,
        calculation,
        imposedAmount: nonNegativeInteger(input.imposedAmount || 0, 'Imposed amount'),
        status,
        administrativeNotes: optionalText(input.administrativeNotes, 4_000),
        projectId: input.projectId ? objectId(input.projectId, 'Project') : null,
        projectStage,
        submissionDeadline: input.policy.trigger === 'late-submission' ? deadline : null,
        relevantStudentIds: (input.relevantStudentIds || [input.student.id]).map((id) => objectId(id, 'Relevant student')),
        liabilityMode: input.liabilityMode || input.policy.liabilityMode,
        liabilityShareNumerator: numerator,
        liabilityShareDenominator: denominator,
        liabilityShareIndex: shareIndex,
        disputesAllowed: input.policy.disputesAllowed,
        policyRestrictions: normalizeRestrictionSet(input.policy.defaultRestrictions || ['none']),
        pausePeriods: input.policy.pausePeriods,
        deduplicationKey,
        generationKey: requiredText(input.generationKey, 'Generation key', 160),
        history: [fineHistory({ action: 'generated', details, actorId, at: eventAt })],
        createdBy: actorId,
        updatedBy: actorId,
      },
    },
    { upsert: true, session: input.session }
  );
  const fine = await StudentFine.findOne({ deduplicationKey }).session(input.session || null);
  if (!fine) throw new Error('Fine record could not be generated.');

  if (upsert.upsertedCount === 1) {
    await recordAudit('fine-record', fine._id, 'generated', details, actorId, input.session);
    const student = await User.findOne({ _id: fine.studentId, role: 'student' })
      .select('email notificationsEnabled')
      .session(input.session || null)
      .lean();
    if (student?.email && student.notificationsEnabled !== false) {
      const message = `${fine.title} was added to your account. Current amount: PKR ${fine.currentAmount}.`;
      await enqueueNotificationEmail({
        dedupeKey: `fine-generated:${fine._id}`,
        to: student.email,
        subject: 'A fine was added to your FYP Portal account',
        text: message,
        html: `<p>${escapeHtml(message)}</p>`,
      }, input.session);
    }
  } else if (!isTerminalFineStatus(fine.status)) {
    await recalculateFineRecord(fine._id, eventAt, actorId, input.session, 'Recalculated after repeated generation request.');
  }
  return fine;
}

async function activePolicies(
  trigger: FineTypeCategory,
  submissionStage?: string,
  session?: ClientSession
) {
  const fineTypes = await FineType.find({ category: trigger, active: true }).session(session || null);
  if (fineTypes.length === 0) return [];
  const policies = await FinePolicy.find({
    fineTypeId: { $in: fineTypes.map((fineType) => fineType._id) },
    trigger,
    status: { $in: ['active', 'paused'] },
    ...(submissionStage ? { submissionStage } : {}),
  }).sort({ fineTypeId: 1, version: -1 }).session(session || null);

  const latestByFineType = new Map<string, typeof FinePolicy.prototype>();
  for (const policy of policies) {
    const key = String(policy.fineTypeId);
    if (!latestByFineType.has(key)) latestByFineType.set(key, policy);
  }
  const fineTypesById = new Map(fineTypes.map((fineType) => [String(fineType._id), fineType]));
  return [...latestByFineType.values()].flatMap((policy) => {
    const fineType = fineTypesById.get(String(policy.fineTypeId));
    return fineType ? [{ policy, fineType }] : [];
  });
}

export async function generateLateRegistrationFines(
  student: StudentIdentity,
  registeredAt: Date,
  session?: ClientSession
) {
  const generated = [];
  for (const { policy, fineType } of await activePolicies('late-registration', undefined, session)) {
    if (!policyAppliesToStudent(policy, student, registeredAt)) continue;
    if (calculateFine({
      ...calculationSnapshot(policy),
      deadline: policy.deadline,
      effectiveAt: registeredAt,
      gracePeriodDays: policy.gracePeriodDays,
      pausePeriods: policy.pausePeriods,
    }).lateDays === 0) continue;
    generated.push(await generateFine({
      policy,
      fineType,
      student,
      reason: `Registration after the ${policy.deadline.toISOString()} deadline.`,
      eventAt: registeredAt,
      projectId: student.projectId,
      projectStage: 'registration',
      generationKey: `registration:${student.id}`,
      actorId: null,
      session,
    }));
  }
  return generated;
}

export async function generateLateSubmissionFines(input: {
  projectId: string;
  projectStage: string;
  triggeringStudentId: string;
  memberIds: string[];
  submittedAt: Date;
  actorId?: Actor;
  session?: ClientSession;
}) {
  const students = await User.find({ _id: { $in: input.memberIds }, role: 'student' })
    .select('_id program batch projectId')
    .session(input.session || null);
  const studentsById = new Map(students.map((student) => [String(student._id), student]));
  const generated = [];
  for (const { policy, fineType } of await activePolicies('late-submission', input.projectStage, input.session)) {
    const triggeringStudent = studentsById.get(input.triggeringStudentId);
    if (!triggeringStudent || !policyAppliesToStudent(policy, triggeringStudent, input.submittedAt)) continue;
    if (calculateFine({
      ...calculationSnapshot(policy),
      deadline: policy.deadline,
      effectiveAt: input.submittedAt,
      gracePeriodDays: policy.gracePeriodDays,
      pausePeriods: policy.pausePeriods,
    }).lateDays === 0) continue;
    const shares = resolveLiabilityShares(
      input.memberIds,
      input.triggeringStudentId,
      policy.liabilityMode
    );
    for (const share of shares) {
      const student = studentsById.get(share.studentId);
      if (!student) continue;
      generated.push(await generateFine({
        policy,
        fineType,
        student: {
          id: String(student._id),
          program: student.program,
          batch: student.batch,
          projectId: input.projectId,
        },
        reason: `${input.projectStage} submission after the configured deadline.`,
        eventAt: input.submittedAt,
        projectId: input.projectId,
        projectStage: input.projectStage,
        relevantStudentIds: input.memberIds,
        generationKey: `submission:${input.projectId}:${input.projectStage}`,
        liabilityMode: policy.liabilityMode,
        liabilityShareNumerator: share.numerator,
        liabilityShareDenominator: share.denominator,
        liabilityShareIndex: share.index,
        actorId: input.actorId || null,
        session: input.session,
      }));
    }
  }
  return generated;
}

export async function createManualFines(input: ManualFineInput) {
  return withTransaction(async (session) => {
    const fineTypeId = objectId(input.fineTypeId, 'Fine type');
    const fineType = await FineType.findOne({ _id: fineTypeId, category: 'manual', active: true }).session(session);
    if (!fineType) throw new Error('Active manual fine type not found.');
    const policy = await FinePolicy.findOne({ fineTypeId, trigger: 'manual', status: 'active' })
      .sort({ version: -1 })
      .session(session);
    if (!policy) throw new Error('Create an active manual fine policy first.');
    const students = await User.find({ _id: { $in: input.studentIds }, role: 'student', isActive: true })
      .select('_id program batch projectId')
      .session(session);
    if (students.length === 0) throw new Error('No active students matched the manual fine request.');

    const restrictions = normalizeRestrictionSet(input.restrictions || policy.defaultRestrictions || ['none']);
    const accumulationEnabled = input.accumulationEnabled === true;
    const calculation: FineCalculation = accumulationEnabled
      ? {
          method: 'starting-plus-daily',
          startingAmount: nonNegativeInteger(input.amount, 'Fine amount'),
          dailyAmount: nonNegativeInteger(input.dailyAmount || 0, 'Daily amount'),
        }
      : { method: 'fixed', fixedAmount: nonNegativeInteger(input.amount, 'Fine amount') };
    policy.defaultRestrictions = restrictions;
    policy.disputesAllowed = input.disputesAllowed !== false;
    const created = [];
    for (const student of students) {
      created.push(await generateFine({
        policy,
        fineType,
        student: {
          id: String(student._id),
          program: student.program,
          batch: student.batch,
          projectId: student.projectId ? String(student.projectId) : null,
        },
        reason: requiredText(input.reason, 'Fine reason', 1_000),
        title: requiredText(input.title, 'Fine title', 120),
        eventAt: new Date(),
        deadlineOverride: input.dueDate,
        generationKey: input.generationKey,
        calculationOverride: calculation,
        imposedAmount: nonNegativeInteger(input.amount, 'Fine amount'),
        administrativeNotes: input.notes,
        actorId: input.actorId,
        session,
      }));
    }
    return created;
  });
}

export async function recalculateFineRecord(
  fineId: unknown,
  effectiveAt: Date,
  actorId: Actor,
  session?: ClientSession,
  reason = 'Fine amount recalculated.'
) {
  const fine = await StudentFine.findById(fineId).session(session || null);
  if (!fine) throw new Error('Fine record not found.');
  if (isTerminalFineStatus(fine.status)) return fine;
  const input = fineCalculationInput(fine, effectiveAt);
  const calculation = calculateFine(input);
  fine.originalAmount = applyLiabilityShare(
    calculation.originalAmount,
    fine.liabilityShareNumerator,
    fine.liabilityShareDenominator,
    fine.liabilityShareIndex
  );
  fine.currentAmount = applyLiabilityShare(
    calculation.currentAmount,
    fine.liabilityShareNumerator,
    fine.liabilityShareDenominator,
    fine.liabilityShareIndex
  );
  fine.accruedAmount = Math.max(fine.currentAmount - fine.originalAmount, 0);
  fine.lateDays = calculation.lateDays;
  if (['scheduled', 'accruing', 'paused', 'pending-payment'].includes(fine.status)) {
    fine.status = fineStatusForCalculation(calculation, input);
  }
  fine.updatedBy = actorId;
  fine.history.push(fineHistory({ action: 'recalculated', details: reason, actorId }));
  await fine.save({ session });
  await recordAudit('fine-record', fine._id, 'recalculated', reason, actorId, session);
  return fine;
}

export async function transitionFineStatus(
  fineId: string,
  status: FineStatus,
  actorId: Actor,
  reason: string
) {
  return withTransaction(async (session) => {
    const fine = await StudentFine.findById(objectId(fineId, 'Fine record')).session(session);
    if (!fine) throw new Error('Fine record not found.');
    assertFineStatusTransition(fine.status, status);
    const details = requiredText(reason, 'Status-change reason', 1_000);
    fine.status = status;
    fine.updatedBy = actorId;
    fine.history.push(fineHistory({ action: `status:${status}`, details, actorId }));
    await fine.save({ session });
    await recordAudit('fine-record', fine._id, `status:${status}`, details, actorId, session);
    return fine;
  });
}

export async function setFineRestrictionOverride(
  fineId: string,
  restrictions: FineRestriction[] | null,
  actorId: string,
  reason: string
) {
  return withTransaction(async (session) => {
    const fine = await StudentFine.findById(objectId(fineId, 'Fine record')).session(session);
    if (!fine) throw new Error('Fine record not found.');
    const details = requiredText(reason, 'Restriction-change reason', 1_000);
    fine.restrictionOverrideEnabled = restrictions !== null;
    fine.restrictionOverride = restrictions === null ? [] : normalizeRestrictionSet(restrictions);
    fine.updatedBy = objectId(actorId, 'Administrator');
    fine.history.push(fineHistory({ action: 'restriction-override', details, actorId }));
    await fine.save({ session });
    await recordAudit('fine-record', fine._id, 'restriction-override', details, actorId, session);
    return fine;
  });
}

export async function correctFineAmount(
  fineId: string,
  currentAmount: number,
  actorId: string,
  reason: string
) {
  return withTransaction(async (session) => {
    const fine = await StudentFine.findById(objectId(fineId, 'Fine record')).session(session);
    if (!fine) throw new Error('Fine record not found.');
    const correctedAmount = nonNegativeInteger(currentAmount, 'Corrected amount');
    const details = requiredText(reason, 'Correction reason', 1_000);
    const previousAmount = fine.currentAmount;
    fine.currentAmount = correctedAmount;
    fine.originalAmount = Math.min(fine.originalAmount, correctedAmount);
    fine.accruedAmount = Math.max(correctedAmount - fine.originalAmount, 0);
    const adjustmentTotal = fine.adjustments.reduce(
      (total: number, adjustment: { kind: FineAdjustmentKind; amount: number }) =>
        total + (adjustment.kind === 'charge' ? adjustment.amount : -adjustment.amount),
      0
    );
    const outstandingAmount = Math.max(correctedAmount + adjustmentTotal - Number(fine.settledAmount || 0), 0);
    if (outstandingAmount === 0 && fine.status !== 'waived' && fine.status !== 'cancelled') {
      fine.status = 'paid';
      fine.accrualStoppedAt ||= new Date();
    } else if (outstandingAmount > 0 && fine.status === 'paid') {
      fine.status = 'pending-payment';
    }
    fine.updatedBy = objectId(actorId, 'Administrator');
    fine.history.push(fineHistory({
      action: 'amount-corrected',
      details: `${details} Previous base amount: PKR ${previousAmount}; corrected base amount: PKR ${correctedAmount}.`,
      actorId,
    }));
    await fine.save({ session });
    await recordAudit(
      'fine-record',
      fine._id,
      'amount-corrected',
      `${details} Previous base amount: PKR ${previousAmount}; corrected base amount: PKR ${correctedAmount}.`,
      actorId,
      session
    );
    return fine;
  });
}

export async function changePolicyStatus(
  policyId: string,
  status: 'active' | 'paused' | 'inactive',
  actorId: string,
  reason: string
) {
  return withTransaction(async (session) => {
    const policy = await FinePolicy.findById(objectId(policyId, 'Fine policy')).session(session);
    if (!policy) throw new Error('Fine policy not found.');
    const now = new Date();
    const details = requiredText(reason, 'Policy-change reason', 1_000);
    if (policy.status === status) return policy;
    const wasPaused = policy.status === 'paused';
    if (status === 'paused' && !wasPaused) {
      policy.pausePeriods.push({ startedAt: now, endedAt: null });
    }
    if (wasPaused && status !== 'paused') {
      const openPause = [...policy.pausePeriods]
        .reverse()
        .find((pause: { endedAt?: Date | null }) => !pause.endedAt);
      if (openPause) openPause.endedAt = now;
    }
    policy.status = status;
    await policy.save({ session });
    await recordAudit('policy', policy._id, status, details, actorId, session);

    if (status === 'paused' || status === 'active' || (status === 'inactive' && wasPaused)) {
      const fines = await StudentFine.find({ policyId: policy._id, status: { $nin: ['paid', 'waived', 'cancelled'] } })
        .session(session);
      for (const fine of fines) {
        if (
          status === 'paused' &&
          !fine.pausePeriods.some((pause: { endedAt?: Date | null }) => !pause.endedAt)
        ) {
          fine.pausePeriods.push({ startedAt: now, endedAt: null });
          if (['scheduled', 'accruing', 'paused', 'pending-payment'].includes(fine.status)) {
            fine.status = 'paused';
          }
          fine.updatedBy = actorId;
          fine.history.push(fineHistory({ action: 'paused', details, actorId, at: now }));
          await fine.save({ session });
          await recordAudit('fine-record', fine._id, 'paused', details, actorId, session);
        } else if (status === 'active' || (status === 'inactive' && wasPaused)) {
          const openPause = [...fine.pausePeriods]
            .reverse()
            .find((pause: { endedAt?: Date | null }) => !pause.endedAt);
          if (openPause) openPause.endedAt = now;
          await fine.save({ session });
          await recalculateFineRecord(fine._id, now, actorId, session, details);
        }
      }
    }
    return policy;
  });
}

export async function previewPolicyDeadlineChange(
  policyId: string,
  newDeadline: Date | string | number,
  selectedStudentIds?: string[]
) {
  const policy = await FinePolicy.findById(objectId(policyId, 'Fine policy'));
  if (!policy) throw new Error('Fine policy not found.');
  const query = {
    policyId: policy._id,
    status: { $nin: ['paid', 'waived', 'cancelled'] },
    ...(selectedStudentIds?.length ? { studentId: { $in: selectedStudentIds } } : {}),
  };
  const fines = await StudentFine.find(query);
  return previewDeadlineChange(
    fines.map((fine) => ({
      id: String(fine._id),
      studentId: String(fine.studentId),
      status: fine.status,
      currentAmount: fine.currentAmount,
      deadline: fine.deadline,
      pausePeriods: fine.pausePeriods,
      accrualStoppedAt: fine.accrualStoppedAt,
      imposedAmount: fine.imposedAmount,
      liabilityShareNumerator: fine.liabilityShareNumerator,
      liabilityShareDenominator: fine.liabilityShareDenominator,
      liabilityShareIndex: fine.liabilityShareIndex,
    })),
    {
      ...policy.calculation.toObject(),
      gracePeriodDays: policy.gracePeriodDays,
      timeZone: policy.timeZone,
    },
    newDeadline,
    new Date()
  );
}

export async function applyPolicyDeadlineChange(input: {
  policyId: string;
  newDeadline: Date | string | number;
  mode: 'new-students-only' | 'all-unresolved' | 'selected-students';
  selectedStudentIds?: string[];
  actorId: string;
  reason: string;
}) {
  if (input.mode === 'selected-students' && !input.selectedStudentIds?.length) {
    throw new Error('Selected-students mode requires at least one student.');
  }
  const preview = await previewPolicyDeadlineChange(
    input.policyId,
    input.newDeadline,
    input.mode === 'selected-students' ? input.selectedStudentIds : undefined
  );
  return withTransaction(async (session) => {
    const policy = await FinePolicy.findById(objectId(input.policyId, 'Fine policy')).session(session);
    if (!policy) throw new Error('Fine policy not found.');
    const details = requiredText(input.reason, 'Deadline-change reason', 1_000);
    const latestVersion = await FinePolicy.findOne({ fineTypeId: policy.fineTypeId })
      .sort({ version: -1 })
      .session(session);
    const nextVersion = nextFinePolicyVersion(latestVersion?.version);
    const currentStagePolicy = await FinePolicy.findOne({
      fineTypeId: policy.fineTypeId,
      submissionStage: policy.submissionStage,
      status: { $in: ['active', 'paused'] },
    }).session(session);
    if (currentStagePolicy && String(currentStagePolicy._id) !== String(policy._id)) {
      currentStagePolicy.status = 'inactive';
      await currentStagePolicy.save({ session });
      await recordAudit(
        'policy',
        currentStagePolicy._id,
        'superseded',
        `Deadline change created policy version ${nextVersion}.`,
        input.actorId,
        session
      );
    }
    const newPolicy = new FinePolicy({
      fineTypeId: policy.fineTypeId,
      version: nextVersion,
      trigger: policy.trigger,
      status: policy.status === 'paused' ? 'paused' : 'active',
      deadline: validDate(input.newDeadline, 'New deadline'),
      gracePeriodDays: policy.gracePeriodDays,
      timeZone: policy.timeZone,
      calculation: policy.calculation.toObject(),
      applicablePrograms: policy.applicablePrograms,
      applicableBatches: policy.applicableBatches,
      effectiveFrom: new Date(),
      submissionStage: policy.submissionStage,
      liabilityMode: policy.liabilityMode,
      acceptedSubmissionStopsAccrual: policy.acceptedSubmissionStopsAccrual,
      rejectedSubmissionMode: policy.rejectedSubmissionMode,
      disputesAllowed: policy.disputesAllowed,
      defaultRestrictions: policy.defaultRestrictions,
      pausePeriods: policy.pausePeriods,
      supersedesPolicyId: policy._id,
      createdBy: objectId(input.actorId, 'Administrator'),
    });
    policy.status = 'inactive';
    await policy.save({ session });
    await newPolicy.save({ session });
    await recordAudit(
      'policy',
      policy._id,
      'superseded',
      `Deadline change created policy version ${nextVersion}. ${details}`,
      input.actorId,
      session
    );
    await recordAudit('policy', newPolicy._id, 'deadline-changed', details, input.actorId, session);

    if (input.mode !== 'new-students-only') {
      const fineIds = preview.fines.map((fine) => fine.fineId);
      for (const fineId of fineIds) {
        const fine = await StudentFine.findById(fineId).session(session);
        if (!fine || isTerminalFineStatus(fine.status)) continue;
        fine.policyId = newPolicy._id;
        fine.policyVersion = newPolicy.version;
        fine.deduplicationKey = buildFineDeduplicationKey({
          studentId: String(fine.studentId),
          fineTypeId: String(fine.fineTypeId),
          projectStage: fine.projectStage,
          policyVersion: newPolicy.version,
          generationKey: fine.generationKey,
        });
        fine.deadline = newPolicy.deadline;
        fine.submissionDeadline = newPolicy.trigger === 'late-submission' ? newPolicy.deadline : fine.submissionDeadline;
        await fine.save({ session });
        await recalculateFineRecord(fine._id, new Date(), input.actorId, session, details);
      }
    }
    return preview;
  });
}

export async function handleSubmissionReview(input: {
  projectId: string;
  projectStage: string;
  decision: 'Approved' | 'Changes Requested' | 'Rejected';
  reviewedAt: Date;
  actorId: Actor;
  session: ClientSession;
}) {
  const fines = await StudentFine.find({
    projectId: objectId(input.projectId, 'Project'),
    projectStage: input.projectStage,
    status: { $nin: ['paid', 'waived', 'cancelled'] },
  }).session(input.session);

  for (const fine of fines) {
    const policy = await FinePolicy.findById(fine.policyId).session(input.session);
    if (!policy) continue;
    if (input.decision === 'Approved' && policy.acceptedSubmissionStopsAccrual) {
      fine.accrualStoppedAt = input.reviewedAt;
      await fine.save({ session: input.session });
      await recalculateFineRecord(
        fine._id,
        input.reviewedAt,
        input.actorId,
        input.session,
        'Accrual stopped when the submission was accepted.'
      );
    } else if (input.decision !== 'Approved' && policy.rejectedSubmissionMode === 'resume-on-rejection') {
      fine.accrualStoppedAt = null;
      await fine.save({ session: input.session });
      await recalculateFineRecord(
        fine._id,
        input.reviewedAt,
        input.actorId,
        input.session,
        'Accrual resumed after the submission was rejected.'
      );
    } else if (input.decision !== 'Approved' && policy.rejectedSubmissionMode === 'reset-from-resubmission') {
      fine.deadline = input.reviewedAt;
      fine.submissionDeadline = input.reviewedAt;
      fine.accrualStoppedAt = null;
      await fine.save({ session: input.session });
      await recalculateFineRecord(
        fine._id,
        input.reviewedAt,
        input.actorId,
        input.session,
        'Accrual reset from the rejected submission date.'
      );
    }
  }
}
