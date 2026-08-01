export type RegistrationPunishmentCategory = 'fine' | 'other';

export interface RegistrationPunishmentPolicy {
  enabled: boolean;
  category: RegistrationPunishmentCategory;
  title: string;
  description: string;
  amount: number;
}

export interface FinePaymentPolicy {
  methodLabel: string;
  accountTitle: string;
  accountNumber: string;
  instructions: string;
}

export interface LateFineAccrualPolicy {
  paused: boolean;
  frozenDays: number;
  frozenAmount: number;
  pausedAt: string | null;
  resumedAt: string | null;
}

export interface FineRestrictionPolicy {
  proposalUpload: boolean;
}

export type FineRestrictionKey = keyof FineRestrictionPolicy;

export const FINE_RESTRICTION_DEFINITIONS: ReadonlyArray<{
  key: FineRestrictionKey;
  name: string;
}> = [{ key: 'proposalUpload', name: 'Proposal upload' }];

export const DEFAULT_FINE_RESTRICTIONS: FineRestrictionPolicy = {
  proposalUpload: true,
};

export interface RegistrationPolicyDto {
  isOpen: boolean;
  closedMessage: string;
  projectSubmissionsOpen: boolean;
  punishment: RegistrationPunishmentPolicy;
  finePayment: FinePaymentPolicy;
  lateFineAccrual: LateFineAccrualPolicy;
  fineRestrictions: FineRestrictionPolicy;
  version: number;
  updatedAt: string | null;
  closedAt: string | null;
  reopenedAt: string | null;
}

export const DEFAULT_REGISTRATION_CLOSED_MESSAGE =
  'Student registration is currently closed. Please contact the FYP administration for assistance.';

export const DEFAULT_REGISTRATION_POLICY: RegistrationPolicyDto = {
  isOpen: true,
  closedMessage: DEFAULT_REGISTRATION_CLOSED_MESSAGE,
  projectSubmissionsOpen: true,
  punishment: {
    enabled: false,
    category: 'fine',
    title: 'Late registration fine',
    description: '',
    amount: 0,
  },
  finePayment: {
    methodLabel: '',
    accountTitle: '',
    accountNumber: '',
    instructions: '',
  },
  lateFineAccrual: {
    paused: false,
    frozenDays: 0,
    frozenAmount: 0,
    pausedAt: null,
    resumedAt: null,
  },
  fineRestrictions: DEFAULT_FINE_RESTRICTIONS,
  version: 0,
  updatedAt: null,
  closedAt: null,
  reopenedAt: null,
};
