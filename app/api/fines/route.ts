import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveFineRestrictions } from '../../../lib/dynamicFineRestriction';
import { disputeFine, submitFinePayment } from '../../../lib/dynamicFinePayment';
import { outstandingFineAmount } from '../../../lib/finePaymentEngine';
import {
  applyLiabilityShare,
  calculateFine,
  fineStatusForCalculation,
} from '../../../lib/finePolicyEngine';
import { readRegistrationPolicy, serializeRegistrationPolicy } from '../../../lib/registrationPolicy';
import { requireCurrentUser } from '../../../lib/security/auth';
import { finalizeUploadReservation, StorageProtocolError } from '../../../lib/storageProtocol';
import FineAudit from '../../../models/FineAudit';
import FinePayment from '../../../models/FinePayment';
import FineType from '../../../models/FineType';
import StudentFine from '../../../models/StudentFine';

export const dynamic = 'force-dynamic';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    : [];
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req, ['student'], { allowPaymentOnly: true });
    if (!currentUser) {
      return NextResponse.json({ error: 'Student fine access is unavailable.' }, { status: 403 });
    }
    const fines = await StudentFine.find({ studentId: currentUser.id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    const fineTypes = await FineType.find({
      _id: { $in: fines.map((fine) => fine.fineTypeId) },
    })
      .select('_id code name')
      .lean();
    const fineTypesById = new Map(fineTypes.map((fineType) => [String(fineType._id), fineType]));
    const now = new Date();
    const serializedFines = fines.map((fine) => {
      const isTerminal = fine.status === 'paid' || fine.status === 'waived' || fine.status === 'cancelled';
      const calculationInput = !isTerminal && fine.deadline
        ? {
            ...fine.calculation,
            deadline: fine.deadline,
            effectiveAt: now,
            gracePeriodDays: fine.gracePeriodDays,
            pausePeriods: fine.pausePeriods,
            accrualStoppedAt: fine.accrualStoppedAt,
            imposedAmount: fine.imposedAmount,
          }
        : null;
      const result = calculationInput ? calculateFine(calculationInput) : null;
      const numerator = Number(fine.liabilityShareNumerator || 1);
      const denominator = Number(fine.liabilityShareDenominator || 1);
      const shareIndex = Number(fine.liabilityShareIndex || 0);
      return {
        id: String(fine._id),
        fineType: fineTypesById.get(String(fine.fineTypeId)) || null,
        title: fine.title,
        reason: fine.reason,
        originalAmount: result
          ? applyLiabilityShare(result.originalAmount, numerator, denominator, shareIndex)
          : fine.originalAmount,
        currentAmount: result
          ? applyLiabilityShare(result.currentAmount, numerator, denominator, shareIndex)
          : fine.currentAmount,
        accruedAmount: result
          ? Math.max(
              applyLiabilityShare(result.currentAmount, numerator, denominator, shareIndex) -
                applyLiabilityShare(result.originalAmount, numerator, denominator, shareIndex),
              0
            )
          : fine.accruedAmount,
        lateDays: result?.lateDays ?? fine.lateDays,
        deadline: fine.deadline,
        gracePeriodDays: fine.gracePeriodDays,
        policyVersion: fine.policyVersion,
        status:
          result && ['scheduled', 'accruing', 'paused', 'pending-payment'].includes(fine.status)
            ? fineStatusForCalculation(result, calculationInput)
            : fine.status,
        projectId: fine.projectId,
        projectStage: fine.projectStage,
        createdAt: fine.createdAt,
        updatedAt: fine.updatedAt,
      };
    });
    const [effectiveRestrictions, registrationPolicy, payments, notifications] = await Promise.all([
      getEffectiveFineRestrictions(currentUser.id),
      readRegistrationPolicy(),
      FinePayment.find({ studentId: currentUser.id })
        .select('-idempotencyKey')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      FineAudit.find({
        entityType: 'fine-record',
        entityId: { $in: fines.map((fine) => fine._id) },
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    ]);
    const fineBalances = new Map(
      serializedFines.map((fine) => {
        const source = fines.find((candidate) => String(candidate._id) === fine.id);
        return [fine.id, {
          id: fine.id,
          currentAmount: fine.currentAmount,
          settledAmount: Number(source?.settledAmount || 0),
          adjustments: source?.adjustments || [],
        }];
      })
    );
    const finesWithBalances = serializedFines.map((fine) => {
      const balance = fineBalances.get(fine.id);
      return {
        ...fine,
        settledAmount: balance?.settledAmount || 0,
        adjustments: balance?.adjustments || [],
        outstandingAmount: balance ? outstandingFineAmount(balance) : fine.currentAmount,
        disputesAllowed: fines.find((candidate) => String(candidate._id) === fine.id)?.disputesAllowed !== false,
      };
    });
    return NextResponse.json(
      {
        fines: finesWithBalances,
        effectiveRestrictions,
        payment: serializeRegistrationPolicy(registrationPolicy).finePayment,
        payments,
        notifications,
        outstandingAmount: finesWithBalances
          .filter((fine) => !['paid', 'waived', 'cancelled'].includes(fine.status))
          .reduce((total, fine) => total + fine.outstandingAmount, 0),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('student_fines_read_failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load student fines.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req, ['student'], { allowPaymentOnly: true });
    if (!currentUser) {
      return NextResponse.json({ error: 'Student fine access is unavailable.' }, { status: 403 });
    }
    const value: unknown = await req.json();
    if (!isRecord(value)) return NextResponse.json({ error: 'A JSON object is required.' }, { status: 400 });
    const action = String(value.action || '').trim();
    if (action === 'disputeFine') {
      const fine = await disputeFine(
        String(value.fineId || ''),
        currentUser.id,
        String(value.reason || '')
      );
      return NextResponse.json({ fine, message: 'Fine dispute submitted.' });
    }
    if (action !== 'submitPayment') {
      return NextResponse.json({ error: 'Unsupported fine action.' }, { status: 400 });
    }

    const idempotencyKey = String(value.idempotencyKey || '').trim();
    const proofKey = String(value.proofKey || '').trim();
    const input = {
      studentId: currentUser.id,
      fineIds: stringList(value.fineIds),
      reference: String(value.reference || ''),
      paidAmount: Number(value.paidAmount),
      paymentDate: String(value.paymentDate || ''),
      message: String(value.message || ''),
      idempotencyKey,
    };
    let payment;
    if (proofKey) {
      if (proofKey !== `fine-proofs/${currentUser.id}/${idempotencyKey}`) {
        return NextResponse.json({ error: 'Payment proof does not belong to this request.' }, { status: 400 });
      }
      const finalized = await finalizeUploadReservation({
        key: proofKey,
        ownerId: currentUser.id,
        kind: 'fine-proof',
        commit: (session, uploadedObject) => submitFinePayment({
          ...input,
          proof: {
            key: proofKey,
            bytes: uploadedObject.actualBytes,
            contentType: uploadedObject.actualContentType,
          },
        }, session),
      });
      payment = finalized.finalizedNow
        ? finalized.result
        : await FinePayment.findOne({ studentId: currentUser.id, idempotencyKey });
    } else {
      payment = await submitFinePayment({ ...input, proof: null });
    }
    if (!payment) throw new Error('Payment submission could not be confirmed.');
    return NextResponse.json(
      { payment, message: 'Payment proof submitted for administrator verification.' },
      { status: 201 }
    );
  } catch (error) {
    console.error('student_fine_action_failed');
    const status = error instanceof StorageProtocolError ? error.statusCode : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update the fine.' },
      { status }
    );
  }
}
