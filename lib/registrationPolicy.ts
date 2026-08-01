import type { ClientSession } from 'mongoose';
import RegistrationPolicy from '../models/RegistrationPolicy';
import {
  DEFAULT_REGISTRATION_POLICY,
  type RegistrationPolicyDto,
} from '../types/registrationPolicy';

export const REGISTRATION_POLICY_KEY = 'student-registration';

export async function getOrCreateRegistrationPolicy() {
  return RegistrationPolicy.findOneAndUpdate(
    { policyKey: REGISTRATION_POLICY_KEY },
    {
      $setOnInsert: {
        policyKey: REGISTRATION_POLICY_KEY,
        isOpen: DEFAULT_REGISTRATION_POLICY.isOpen,
        closedMessage: DEFAULT_REGISTRATION_POLICY.closedMessage,
        projectSubmissionsOpen: DEFAULT_REGISTRATION_POLICY.projectSubmissionsOpen,
        punishment: DEFAULT_REGISTRATION_POLICY.punishment,
        finePayment: DEFAULT_REGISTRATION_POLICY.finePayment,
        lateFineAccrual: DEFAULT_REGISTRATION_POLICY.lateFineAccrual,
        fineRestrictions: DEFAULT_REGISTRATION_POLICY.fineRestrictions,
        version: DEFAULT_REGISTRATION_POLICY.version,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

export function readRegistrationPolicy(session?: ClientSession) {
  const query = RegistrationPolicy.findOne({ policyKey: REGISTRATION_POLICY_KEY });
  if (session) query.session(session);
  return query;
}

type RegistrationPolicyRecord = {
  isOpen?: boolean;
  closedMessage?: unknown;
  projectSubmissionsOpen?: unknown;
  punishment?: Record<string, unknown> | null;
  finePayment?: Record<string, unknown> | null;
  lateFineAccrual?: Record<string, unknown> | null;
  fineRestrictions?: Record<string, unknown> | null;
  version?: unknown;
  updatedAt?: string | number | Date | null;
  closedAt?: string | number | Date | null;
  reopenedAt?: string | number | Date | null;
};

export function serializeRegistrationPolicy(policy: RegistrationPolicyRecord | null | undefined): RegistrationPolicyDto {
  if (!policy) return { ...DEFAULT_REGISTRATION_POLICY };

  const punishment = policy.punishment || {};
  const finePayment = policy.finePayment || {};
  const lateFineAccrual = policy.lateFineAccrual || {};
  const fineRestrictions = policy.fineRestrictions || {};

  return {
    isOpen: policy.isOpen !== false,
    closedMessage:
      String(policy.closedMessage || '').trim() || DEFAULT_REGISTRATION_POLICY.closedMessage,
    projectSubmissionsOpen: policy.projectSubmissionsOpen !== false,
    punishment: {
      enabled: punishment.enabled === true,
      category: punishment.category === 'other' ? 'other' : 'fine',
      title: String(punishment.title || '').trim(),
      description: String(punishment.description || '').trim(),
      amount:
        Number.isFinite(Number(punishment.amount)) && Number(punishment.amount) > 0
          ? Math.round(Number(punishment.amount))
          : 0,
    },
    finePayment: {
      methodLabel: String(finePayment.methodLabel || '').trim(),
      accountTitle: String(finePayment.accountTitle || '').trim(),
      accountNumber: String(finePayment.accountNumber || '').trim(),
      instructions: String(finePayment.instructions || '').trim(),
    },
    lateFineAccrual: {
      paused: lateFineAccrual.paused === true,
      frozenDays: Math.max(Math.trunc(Number(lateFineAccrual.frozenDays) || 0), 0),
      frozenAmount: Math.max(Math.round(Number(lateFineAccrual.frozenAmount) || 0), 0),
      pausedAt: lateFineAccrual.pausedAt
        ? new Date(lateFineAccrual.pausedAt as string | number | Date).toISOString()
        : null,
      resumedAt: lateFineAccrual.resumedAt
        ? new Date(lateFineAccrual.resumedAt as string | number | Date).toISOString()
        : null,
    },
    fineRestrictions: {
      proposalUpload: fineRestrictions.proposalUpload !== false,
    },
    version: Number.isFinite(Number(policy.version)) ? Number(policy.version) : 0,
    updatedAt: policy.updatedAt ? new Date(policy.updatedAt).toISOString() : null,
    closedAt: policy.closedAt ? new Date(policy.closedAt).toISOString() : null,
    reopenedAt: policy.reopenedAt ? new Date(policy.reopenedAt).toISOString() : null,
  };
}

export function buildRegistrationPunishmentSnapshot(
  policy: RegistrationPolicyDto,
  imposedAt = new Date()
) {
  if (!policy.isOpen || !policy.punishment.enabled) {
    return {
      active: false,
      category: null,
      title: '',
      description: '',
      amount: 0,
      status: 'pending',
      policyVersion: policy.version,
      imposedAt: null,
      resolvedAt: null,
    };
  }

  return {
    active: true,
    category: policy.punishment.category,
    title: policy.punishment.title,
    description: policy.punishment.description,
    amount: policy.punishment.category === 'fine' ? policy.punishment.amount : 0,
    status: 'pending',
    policyVersion: policy.version,
    imposedAt,
    resolvedAt: null,
  };
}
