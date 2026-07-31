import mongoose, { type ClientSession } from 'mongoose';

import FineAudit from '../models/FineAudit';
import FinePayment from '../models/FinePayment';
import Project from '../models/Project';
import RegistrationPolicy from '../models/RegistrationPolicy';
import StudentFine from '../models/StudentFine';
import User from '../models/User';
import type { FineAdjustmentKind } from '../types/fines';
import { getEffectiveFineRestrictions } from './dynamicFineRestriction';
import { enqueueNotificationEmail } from './emailOutbox';
import { allocateFinePayment, outstandingFineAmount, type FineBalance } from './finePaymentEngine';
import { recalculateFineRecord } from './dynamicFineService';
import { applyLiabilityShare, calculateFine } from './finePolicyEngine';
import { reserveSupervisorProjectSlot, capacityReservationError } from './supervisorCapacity';

type PaymentProof = {
  key: string;
  bytes: number;
  contentType: string;
} | null;

type SubmitPaymentInput = {
  studentId: string;
  fineIds: string[];
  reference: string;
  paidAmount: number;
  paymentDate: Date | string | number;
  message?: string;
  idempotencyKey: string;
  proof: PaymentProof;
  source?: 'student' | 'offline';
};

type VerifyPaymentInput = {
  paymentId: string;
  fineIds?: string[];
  actorId: string;
  reason: string;
};

function objectId(value: string, label: string) {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new Error(`${label} is invalid.`);
  return new mongoose.Types.ObjectId(value);
}

function requiredText(value: unknown, label: string, maximumLength: number) {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${label} is required.`);
  return result.slice(0, maximumLength);
}

function positiveMoney(value: unknown, label: string) {
  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${label} must be greater than zero.`);
  return amount;
}

function paymentDate(value: Date | string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Payment date is invalid.');
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1_000) {
    throw new Error('Payment date cannot be in the future.');
  }
  return date;
}

function uniqueIds(values: string[], label: string) {
  const ids = [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
  if (ids.length === 0 || !ids.every(mongoose.Types.ObjectId.isValid)) {
    throw new Error(`Select at least one valid ${label}.`);
  }
  return ids;
}

function escapeHtml(value: unknown) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fineBalance(fine: typeof StudentFine.prototype): FineBalance {
  return {
    id: String(fine._id),
    currentAmount: Number(fine.currentAmount || 0),
    settledAmount: Number(fine.settledAmount || 0),
    adjustments: (fine.adjustments || []).map((adjustment: { kind: FineAdjustmentKind; amount: number }) => ({
      kind: adjustment.kind,
      amount: adjustment.amount,
    })),
  };
}

function currentFineBalance(fine: typeof StudentFine.prototype, effectiveAt: Date): FineBalance {
  if (!fine.deadline) return fineBalance(fine);
  const result = calculateFine({
    ...fine.calculation,
    deadline: fine.deadline,
    effectiveAt,
    gracePeriodDays: fine.gracePeriodDays,
    pausePeriods: fine.pausePeriods,
    accrualStoppedAt: fine.accrualStoppedAt,
    imposedAmount: fine.imposedAmount,
  });
  return {
    ...fineBalance(fine),
    currentAmount: applyLiabilityShare(
      result.currentAmount,
      Number(fine.liabilityShareNumerator || 1),
      Number(fine.liabilityShareDenominator || 1),
      Number(fine.liabilityShareIndex || 0)
    ),
  };
}

async function withTransaction<T>(work: (session: ClientSession) => Promise<T>) {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    if (result === undefined) throw new Error('Payment transaction returned no result.');
    return result;
  } finally {
    await session.endSession();
  }
}

async function audit(
  entityType: 'fine-record' | 'payment-record',
  entityId: unknown,
  action: string,
  details: string,
  actorId: string | null,
  session: ClientSession
) {
  await new FineAudit({ entityType, entityId, action, details, actorId }).save({ session });
}

function appendFineHistory(
  fine: typeof StudentFine.prototype,
  action: string,
  details: string,
  actorId: string | null,
  at = new Date()
) {
  fine.history.push({ action, details, actorId, at });
  fine.updatedBy = actorId;
}

async function notifyStudent(
  student: { _id: unknown; email?: string | null; notificationsEnabled?: boolean },
  dedupeKey: string,
  subject: string,
  message: string,
  session: ClientSession
) {
  if (!student.email || student.notificationsEnabled === false) return;
  await enqueueNotificationEmail(
    {
      dedupeKey,
      to: student.email,
      subject,
      text: message,
      html: `<p>${escapeHtml(message)}</p>`,
    },
    session
  );
}

async function notifyAdministrators(
  dedupeKey: string,
  subject: string,
  message: string,
  session: ClientSession
) {
  const administrators = await User.find({
    role: 'admin',
    isActive: true,
    notificationsEnabled: { $ne: false },
    email: { $exists: true, $nin: ['', null] },
  })
    .select('_id email')
    .session(session)
    .lean();
  for (const administrator of administrators) {
    if (!administrator.email) continue;
    await enqueueNotificationEmail(
      {
        dedupeKey: `${dedupeKey}:${administrator._id}`,
        to: administrator.email,
        subject,
        text: message,
        html: `<p>${escapeHtml(message)}</p>`,
      },
      session
    );
  }
}

async function paymentPolicy(session: ClientSession) {
  const policy = await RegistrationPolicy.findOne({ policyKey: 'student-registration' })
    .select('finePayment')
    .session(session)
    .lean();
  return {
    requiredProof: policy?.finePayment?.requiredProof !== false,
    partialPaymentsEnabled: policy?.finePayment?.partialPaymentsEnabled === true,
  };
}

async function createPaymentSubmission(input: SubmitPaymentInput, session: ClientSession) {
  const studentId = objectId(input.studentId, 'Student');
  const fineIds = uniqueIds(input.fineIds, 'fine record');
  const reference = requiredText(input.reference, 'Payment reference', 160);
  const paidAmount = positiveMoney(input.paidAmount, 'Paid amount');
  const idempotencyKey = requiredText(input.idempotencyKey, 'Payment idempotency key', 128);
  const policy = await paymentPolicy(session);
  if (input.source !== 'offline' && policy.requiredProof && !input.proof) {
    throw new Error('Payment proof is required.');
  }

  const existing = await FinePayment.findOne({ studentId, idempotencyKey }).session(session);
  if (existing) return existing;

  const student = await User.findOne({ _id: studentId, role: 'student', isActive: true })
    .select('_id name rollNo email notificationsEnabled')
    .session(session);
  if (!student) throw new Error('Active student account not found.');
  const fines = await StudentFine.find({
    _id: { $in: fineIds },
    studentId,
    status: { $nin: ['paid', 'waived', 'cancelled'] },
  }).session(session);
  if (fines.length !== fineIds.length) {
    throw new Error('One or more selected fines are unavailable for payment.');
  }
  const activePayment = await FinePayment.exists({
    studentId,
    status: { $in: ['submitted', 'under-verification'] },
    fineIds: { $in: fineIds },
  }).session(session);
  if (activePayment) {
    throw new Error('One or more selected fines already have a payment awaiting verification.');
  }

  const payment = new FinePayment({
    studentId,
    fineIds,
    source: input.source || 'student',
    status: 'submitted',
    reference,
    paidAmount,
    paymentDate: paymentDate(input.paymentDate),
    proofKey: input.proof?.key || null,
    proofBytes: input.proof?.bytes || 0,
    proofContentType: input.proof?.contentType || '',
    message: String(input.message || '').trim().slice(0, 1_000),
    idempotencyKey,
  });
  await payment.save({ session });

  const details = `Payment ${reference} submitted for PKR ${paidAmount}.`;
  for (const fine of fines) {
    fine.status = 'payment-submitted';
    appendFineHistory(fine, 'payment-submitted', details, String(student._id));
    await fine.save({ session });
    await audit('fine-record', fine._id, 'payment-submitted', details, String(student._id), session);
  }
  await audit('payment-record', payment._id, 'submitted', details, String(student._id), session);
  await notifyAdministrators(
    `fine-payment-submitted:${payment._id}`,
    'Fine payment requires verification',
    `${student.name} (${student.rollNo}) submitted payment ${reference} for PKR ${paidAmount}.`,
    session
  );
  return payment;
}

export async function submitFinePayment(input: SubmitPaymentInput, session?: ClientSession) {
  return session
    ? createPaymentSubmission(input, session)
    : withTransaction((transaction) => createPaymentSubmission(input, transaction));
}

function selectPaymentFines(payment: typeof FinePayment.prototype, selectedFineIds?: string[]): string[] {
  const paymentFineIds = payment.fineIds.map((fineId: unknown) => String(fineId));
  if (!selectedFineIds?.length) return paymentFineIds;
  const selected = uniqueIds(selectedFineIds, 'fine record');
  if (!selected.every((fineId) => paymentFineIds.includes(fineId))) {
    throw new Error('Selected fines are not part of this payment submission.');
  }
  return selected;
}

export async function previewFineClearance(paymentId: string, selectedFineIds?: string[]) {
  const payment = await FinePayment.findById(objectId(paymentId, 'Payment record')).lean();
  if (!payment) throw new Error('Payment record not found.');
  const fineIds = selectPaymentFines(payment, selectedFineIds);
  const [student, fines, restrictions] = await Promise.all([
    User.findOne({ _id: payment.studentId, role: 'student' })
      .select('_id name rollNo projectId supervisorId')
      .lean(),
    StudentFine.find({
      _id: { $in: fineIds },
      studentId: payment.studentId,
      status: { $nin: ['paid', 'waived', 'cancelled'] },
    }).lean(),
    getEffectiveFineRestrictions(String(payment.studentId)),
  ]);
  if (!student) throw new Error('Student account not found.');
  if (fines.length !== fineIds.length) throw new Error('One or more selected fines are already resolved.');

  const policy = await RegistrationPolicy.findOne({ policyKey: 'student-registration' })
    .select('finePayment.partialPaymentsEnabled')
    .lean();
  const allocation = allocateFinePayment(
    fines.map((fine) => currentFineBalance(fine, new Date())),
    Number(payment.paidAmount),
    policy?.finePayment?.partialPaymentsEnabled === true
  );
  const selected = new Set(fineIds);
  const snapshots = fines.flatMap((fine) => fine.restorationSnapshots || []);
  return {
    paymentId: String(payment._id),
    student: { id: String(student._id), name: student.name, rollNo: student.rollNo },
    fineIds,
    paymentReference: payment.reference,
    paidAmount: payment.paidAmount,
    outstandingAmount: allocation.outstandingAmount,
    settledAmount: allocation.settledAmount,
    unallocatedAmount: allocation.unallocatedAmount,
    allocations: allocation.allocations,
    restrictionsToRemove: restrictions.sources.filter((source) => selected.has(source.fineId)),
    remainingRestrictionSources: restrictions.sources.filter((source) => !selected.has(source.fineId)),
    projectId: student.projectId ? String(student.projectId) : null,
    previousRelationships: snapshots.map((snapshot) => ({
      action: snapshot.action,
      projectId: snapshot.projectId ? String(snapshot.projectId) : null,
      supervisorId: snapshot.supervisorId ? String(snapshot.supervisorId) : null,
      memberIds: (snapshot.memberIds || []).map((memberId: unknown) => String(memberId)),
    })),
    automaticRestoration: ['Fine restrictions and payment-only access are recalculated automatically.'],
    manualRestoration: snapshots.length > 0
      ? ['Previous team and supervisor relationships require a separate capacity-checked restoration action.']
      : [],
  };
}

export async function previewOfflinePayment(studentId: string, selectedFineIds: string[], paidAmount: number) {
  const ownerId = objectId(studentId, 'Student');
  const fineIds = uniqueIds(selectedFineIds, 'fine record');
  const amount = positiveMoney(paidAmount, 'Paid amount');
  const [student, fines, policy] = await Promise.all([
    User.findOne({ _id: ownerId, role: 'student', isActive: true }).select('_id name rollNo').lean(),
    StudentFine.find({
      _id: { $in: fineIds },
      studentId: ownerId,
      status: { $nin: ['paid', 'waived', 'cancelled'] },
    }).lean(),
    RegistrationPolicy.findOne({ policyKey: 'student-registration' })
      .select('finePayment.partialPaymentsEnabled')
      .lean(),
  ]);
  if (!student) throw new Error('Active student account not found.');
  if (fines.length !== fineIds.length) throw new Error('One or more selected fines are unavailable for payment.');
  const orderedFines = fineIds.map((fineId) => {
    const fine = fines.find((candidate) => String(candidate._id) === fineId);
    if (!fine) throw new Error('Selected fine record changed during preview.');
    return fine;
  });
  const allocation = allocateFinePayment(
    orderedFines.map((fine) => currentFineBalance(fine, new Date())),
    amount,
    policy?.finePayment?.partialPaymentsEnabled === true
  );
  return {
    student: { id: String(student._id), name: student.name, rollNo: student.rollNo },
    fineIds,
    ...allocation,
  };
}

export async function markPaymentUnderVerification(paymentId: string, actorId: string) {
  return withTransaction(async (session) => {
    const payment = await FinePayment.findOne({
      _id: objectId(paymentId, 'Payment record'),
      status: 'submitted',
    }).session(session);
    if (!payment) throw new Error('Submitted payment record not found.');
    payment.status = 'under-verification';
    payment.reviewedBy = objectId(actorId, 'Administrator');
    await payment.save({ session });
    await StudentFine.updateMany(
      { _id: { $in: payment.fineIds }, status: 'payment-submitted' },
      { $set: { status: 'under-verification', updatedBy: objectId(actorId, 'Administrator') } },
      { session }
    );
    await audit('payment-record', payment._id, 'under-verification', 'Payment review started.', actorId, session);
    return payment;
  });
}

async function verifyFinePaymentInSession(input: VerifyPaymentInput, session: ClientSession) {
  const reason = requiredText(input.reason, 'Verification reason', 1_000);
  const payment = await FinePayment.findOne({
    _id: objectId(input.paymentId, 'Payment record'),
    status: { $in: ['submitted', 'under-verification'] },
  }).session(session);
  if (!payment) throw new Error('Payment is unavailable for verification.');
  const fineIds = selectPaymentFines(payment, input.fineIds);
  for (const fineId of fineIds) {
    await recalculateFineRecord(
      fineId,
      new Date(),
      input.actorId,
      session,
      'Fine amount frozen for payment verification.'
    );
  }
  const fines = await StudentFine.find({
    _id: { $in: fineIds },
    studentId: payment.studentId,
    status: { $nin: ['paid', 'waived', 'cancelled'] },
  }).session(session);
  if (fines.length !== fineIds.length) throw new Error('One or more selected fines are already resolved.');
  const policy = await paymentPolicy(session);
  const orderedFines = fineIds.map((fineId) => {
    const fine = fines.find((candidate) => String(candidate._id) === fineId);
    if (!fine) throw new Error('Selected fine record changed during verification.');
    return fine;
  });
  const allocation = allocateFinePayment(
    orderedFines.map(fineBalance),
    Number(payment.paidAmount),
    policy.partialPaymentsEnabled
  );
  const allocationsByFine = new Map(
    allocation.allocations.map((item) => [item.fineId, item])
  );
  const now = new Date();
  for (const fine of orderedFines) {
    const allocated = allocationsByFine.get(String(fine._id));
    if (!allocated) continue;
    fine.settledAmount = Number(fine.settledAmount || 0) + allocated.amount;
    fine.status = allocated.remainingBalance === 0 ? 'paid' : 'pending-payment';
    if (fine.status === 'paid') fine.accrualStoppedAt = now;
    appendFineHistory(
      fine,
      fine.status === 'paid' ? 'payment-verified' : 'partially-settled',
      reason,
      input.actorId,
      now
    );
    await fine.save({ session });
    await audit('fine-record', fine._id, fine.status, reason, input.actorId, session);
  }
  const selected = new Set(fineIds);
  const unselectedFineIds = payment.fineIds.filter((fineId: unknown) => !selected.has(String(fineId)));
  if (unselectedFineIds.length > 0) {
    await StudentFine.updateMany(
      {
        _id: { $in: unselectedFineIds },
        studentId: payment.studentId,
        status: { $in: ['payment-submitted', 'under-verification'] },
      },
      { $set: { status: 'pending-payment', updatedBy: objectId(input.actorId, 'Administrator') } },
      { session }
    );
  }
  payment.status = 'accepted';
  payment.allocations = allocation.allocations.map((item) => ({
    fineId: objectId(item.fineId, 'Fine record'),
    amount: item.amount,
  }));
  payment.unallocatedAmount = allocation.unallocatedAmount;
  payment.rejectionReason = '';
  payment.reviewedBy = objectId(input.actorId, 'Administrator');
  payment.reviewedAt = now;
  await payment.save({ session });
  await audit('payment-record', payment._id, 'accepted', reason, input.actorId, session);

  const student = await User.findOne({ _id: payment.studentId, role: 'student' })
    .select('_id email notificationsEnabled')
    .session(session);
  if (student) {
    await notifyStudent(
      student,
      `fine-payment-accepted:${payment._id}`,
      'Fine payment accepted',
      `Your payment ${payment.reference} was accepted. Settled amount: PKR ${allocation.settledAmount}. Fine restrictions were recalculated.`,
      session
    );
  }
  return {
    payment,
    settledAmount: allocation.settledAmount,
    unallocatedAmount: allocation.unallocatedAmount,
    paidFineIds: allocation.allocations
      .filter((item) => item.remainingBalance === 0)
      .map((item) => item.fineId),
  };
}

export async function verifyFinePayment(input: VerifyPaymentInput) {
  return withTransaction((session) => verifyFinePaymentInSession(input, session));
}

export async function rejectFinePayment(paymentId: string, actorId: string, reason: string) {
  const details = requiredText(reason, 'Rejection reason', 1_000);
  return withTransaction(async (session) => {
    const payment = await FinePayment.findOne({
      _id: objectId(paymentId, 'Payment record'),
      status: { $in: ['submitted', 'under-verification'] },
    }).session(session);
    if (!payment) throw new Error('Payment is unavailable for rejection.');
    const now = new Date();
    payment.status = 'rejected';
    payment.rejectionReason = details;
    payment.reviewedBy = objectId(actorId, 'Administrator');
    payment.reviewedAt = now;
    await payment.save({ session });
    const fines = await StudentFine.find({
      _id: { $in: payment.fineIds },
      status: { $in: ['payment-submitted', 'under-verification'] },
    }).session(session);
    for (const fine of fines) {
      fine.status = 'pending-payment';
      appendFineHistory(fine, 'payment-rejected', details, actorId, now);
      await fine.save({ session });
      await audit('fine-record', fine._id, 'payment-rejected', details, actorId, session);
    }
    await audit('payment-record', payment._id, 'rejected', details, actorId, session);
    const student = await User.findOne({ _id: payment.studentId, role: 'student' })
      .select('_id email notificationsEnabled')
      .session(session);
    if (student) {
      await notifyStudent(
        student,
        `fine-payment-rejected:${payment._id}`,
        'Fine payment rejected',
        `Your payment ${payment.reference} was rejected: ${details}`,
        session
      );
    }
    return payment;
  });
}

export async function waiveFine(fineId: string, actorId: string, reason: string) {
  const details = requiredText(reason, 'Waiver reason', 1_000);
  return withTransaction(async (session) => {
    const fine = await StudentFine.findOne({
      _id: objectId(fineId, 'Fine record'),
      status: { $nin: ['paid', 'waived', 'cancelled'] },
    }).session(session);
    if (!fine) throw new Error('Unresolved fine record not found.');
    fine.status = 'waived';
    fine.accrualStoppedAt = new Date();
    appendFineHistory(fine, 'waived', details, actorId);
    await fine.save({ session });
    await audit('fine-record', fine._id, 'waived', details, actorId, session);
    const student = await User.findOne({ _id: fine.studentId, role: 'student' })
      .select('_id email notificationsEnabled')
      .session(session);
    if (student) {
      await notifyStudent(
        student,
        `fine-waived:${fine._id}`,
        'Fine waived',
        `Your fine “${fine.title}” was waived.`,
        session
      );
    }
    return fine;
  });
}

export async function adjustFine(
  fineId: string,
  kind: FineAdjustmentKind,
  amount: number,
  actorId: string,
  reason: string
) {
  const details = requiredText(reason, 'Adjustment reason', 1_000);
  return withTransaction(async (session) => {
    const fine = await StudentFine.findOne({
      _id: objectId(fineId, 'Fine record'),
      status: { $nin: ['paid', 'waived', 'cancelled'] },
    }).session(session);
    if (!fine) throw new Error('Unresolved fine record not found.');
    const adjustmentAmount = positiveMoney(amount, 'Adjustment amount');
    const now = new Date();
    fine.adjustments.push({
      kind,
      amount: adjustmentAmount,
      reason: details,
      actorId: objectId(actorId, 'Administrator'),
      at: now,
    });
    if (outstandingFineAmount(fineBalance(fine)) === 0) {
      fine.status = 'paid';
      fine.accrualStoppedAt = now;
    }
    appendFineHistory(fine, `adjustment:${kind}`, details, actorId, now);
    await fine.save({ session });
    await audit('fine-record', fine._id, `adjustment:${kind}`, details, actorId, session);
    return fine;
  });
}

export async function recordOfflinePayment(input: Omit<SubmitPaymentInput, 'proof' | 'source'> & {
  actorId: string;
  reason: string;
}) {
  return withTransaction(async (session) => {
    const payment = await createPaymentSubmission({ ...input, proof: null, source: 'offline' }, session);
    if (payment.status === 'accepted') {
      return {
        payment,
        settledAmount: payment.allocations.reduce(
          (total: number, allocation: { amount: number }) => total + Number(allocation.amount || 0),
          0
        ),
        unallocatedAmount: Number(payment.unallocatedAmount || 0),
        paidFineIds: payment.allocations.map((allocation: { fineId: unknown }) => String(allocation.fineId)),
      };
    }
    return verifyFinePaymentInSession({
      paymentId: String(payment._id),
      fineIds: input.fineIds,
      actorId: input.actorId,
      reason: input.reason,
    }, session);
  });
}

export async function disputeFine(fineId: string, studentId: string, reason: string) {
  const details = requiredText(reason, 'Dispute reason', 1_000);
  return withTransaction(async (session) => {
    const fine = await StudentFine.findOne({
      _id: objectId(fineId, 'Fine record'),
      studentId: objectId(studentId, 'Student'),
      disputesAllowed: true,
      status: { $nin: ['paid', 'waived', 'cancelled', 'disputed'] },
    }).session(session);
    if (!fine) throw new Error('This fine is unavailable for dispute.');
    fine.status = 'disputed';
    appendFineHistory(fine, 'disputed', details, studentId);
    await fine.save({ session });
    await audit('fine-record', fine._id, 'disputed', details, studentId, session);
    await notifyAdministrators(
      `fine-disputed:${fine._id}`,
      'Fine dispute requires review',
      `A student disputed fine “${fine.title}”: ${details}`,
      session
    );
    return fine;
  });
}

export async function previewFineRestoration(fineId: string) {
  const fine = await StudentFine.findOne({
    _id: objectId(fineId, 'Fine record'),
    status: { $in: ['paid', 'waived'] },
  }).lean();
  if (!fine) throw new Error('Paid or waived fine record not found.');
  const student = await User.findOne({ _id: fine.studentId, role: 'student' })
    .select('_id name rollNo projectId supervisorId isActive')
    .lean();
  if (!student) throw new Error('Student account not found.');
  const snapshot = [...(fine.restorationSnapshots || [])].at(-1) || null;
  const project = snapshot?.projectId
    ? await Project.findById(snapshot.projectId).select('_id title members maxTeamSize supervisorId').lean()
    : null;
  const previousSupervisor = snapshot?.supervisorId
    ? await User.findOne({ _id: snapshot.supervisorId, role: 'supervisor' })
        .select('_id name isActive occupiedSlots extraSlots')
        .lean()
    : null;
  const restrictions = await getEffectiveFineRestrictions(String(student._id), false);
  return {
    fineId: String(fine._id),
    student: {
      id: String(student._id),
      name: student.name,
      rollNo: student.rollNo,
      active: student.isActive !== false,
      currentProjectId: student.projectId ? String(student.projectId) : null,
    },
    snapshot: snapshot
      ? {
          action: snapshot.action,
          projectId: snapshot.projectId ? String(snapshot.projectId) : null,
          supervisorId: snapshot.supervisorId ? String(snapshot.supervisorId) : null,
        }
      : null,
    project: project
      ? {
          id: String(project._id),
          title: project.title,
          members: project.members.map((memberId: unknown) => String(memberId)),
          maxTeamSize: Number(project.maxTeamSize || 2),
          supervisorId: project.supervisorId ? String(project.supervisorId) : null,
        }
      : null,
    previousSupervisor: previousSupervisor
      ? { id: String(previousSupervisor._id), name: previousSupervisor.name, active: previousSupervisor.isActive !== false }
      : null,
    remainingRestrictions: restrictions,
  };
}

export async function restoreFineRelationships(
  fineId: string,
  mode: 'team' | 'supervisor' | 'both' | 'leave-unassigned',
  actorId: string,
  reason: string
) {
  const preview = await previewFineRestoration(fineId);
  const details = requiredText(reason, 'Restoration reason', 1_000);
  if (mode === 'leave-unassigned') {
    return withTransaction(async (session) => {
      const fine = await StudentFine.findById(objectId(fineId, 'Fine record')).session(session);
      if (!fine) throw new Error('Fine record not found.');
      appendFineHistory(fine, 'restoration:leave-unassigned', details, actorId);
      await fine.save({ session });
      await audit('fine-record', fine._id, 'restoration:leave-unassigned', details, actorId, session);
      return { restoredTeam: false, restoredSupervisor: false };
    });
  }
  if (!preview.snapshot || !preview.project) throw new Error('No restorable project relationship was recorded.');
  const snapshot = preview.snapshot;
  if (!preview.student.active) throw new Error('Student account is inactive.');
  if (preview.remainingRestrictions.blocksTeamMembership && (mode === 'team' || mode === 'both')) {
    throw new Error('Another unresolved fine still blocks team membership.');
  }
  if (preview.remainingRestrictions.blocksSupervisorSelection && (mode === 'supervisor' || mode === 'both')) {
    throw new Error('Another unresolved fine still blocks supervisor restoration.');
  }

  return withTransaction(async (session) => {
    const fine = await StudentFine.findById(objectId(fineId, 'Fine record')).session(session);
    const student = await User.findOne({ _id: preview.student.id, role: 'student', isActive: true }).session(session);
    const project = await Project.findById(preview.project?.id).session(session);
    if (!fine || !student || !project) throw new Error('Restoration target changed. Refresh and try again.');
    let restoredTeam = false;
    let restoredSupervisor = false;

    if (mode === 'team' || mode === 'both') {
      if (student.projectId && String(student.projectId) !== String(project._id)) {
        throw new Error('Student already belongs to another project.');
      }
      const alreadyMember = project.members.some((memberId: unknown) => String(memberId) === String(student._id));
      if (!alreadyMember && project.members.length >= Number(project.maxTeamSize || 2)) {
        throw new Error('Previous team is at capacity.');
      }
      const activeMembers = await User.countDocuments({
        _id: { $in: project.members },
        role: 'student',
        isActive: true,
      }).session(session);
      if (activeMembers !== project.members.length) {
        throw new Error('Every existing project member must remain active before restoration.');
      }
      if (!alreadyMember) project.members.push(student._id);
      student.projectId = project._id;
      student.status = project.status;
      restoredTeam = true;
    }

    if (mode === 'supervisor' || mode === 'both') {
      const supervisorId = snapshot.supervisorId;
      if (!supervisorId) throw new Error('No previous supervisor was recorded.');
      if (!await User.exists({ _id: supervisorId, role: 'supervisor', isActive: true }).session(session)) {
        throw new Error('Previous supervisor account is inactive or unavailable.');
      }
      if (!student.projectId || String(student.projectId) !== String(project._id)) {
        throw new Error('Restore team membership before restoring the supervisor.');
      }
      if (project.supervisorId && String(project.supervisorId) !== supervisorId) {
        throw new Error('Project already has a different supervisor.');
      }
      if (!project.supervisorId) {
        const reservation = await reserveSupervisorProjectSlot(supervisorId, session);
        if (reservation !== 'reserved') throw new Error(capacityReservationError(reservation));
        project.supervisorId = objectId(supervisorId, 'Supervisor');
      }
      student.supervisorId = project.supervisorId;
      restoredSupervisor = true;
    }

    await project.save({ session });
    await student.save({ session });
    appendFineHistory(fine, `restoration:${mode}`, details, actorId);
    await fine.save({ session });
    await audit('fine-record', fine._id, `restoration:${mode}`, details, actorId, session);
    await notifyStudent(
      student,
      `fine-restoration:${fine._id}:${mode}`,
      'Fine relationship restoration updated',
      `The administrator completed the ${mode.replaceAll('-', ' ')} restoration action for ${fine.title}.`,
      session
    );
    return { restoredTeam, restoredSupervisor };
  });
}
