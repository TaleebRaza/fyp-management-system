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
        punishment: DEFAULT_REGISTRATION_POLICY.punishment,
        version: DEFAULT_REGISTRATION_POLICY.version,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

export async function readRegistrationPolicy(session?: ClientSession) {
  const query = RegistrationPolicy.findOne({ policyKey: REGISTRATION_POLICY_KEY });
  if (session) query.session(session);
  return query;
}

export function serializeRegistrationPolicy(policy: any): RegistrationPolicyDto {
  if (!policy) return { ...DEFAULT_REGISTRATION_POLICY };

  const punishment = policy.punishment || {};

  return {
    isOpen: policy.isOpen !== false,
    closedMessage:
      String(policy.closedMessage || '').trim() || DEFAULT_REGISTRATION_POLICY.closedMessage,
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
