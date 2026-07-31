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
  requiredProof: boolean;
  verificationContact: string;
  partialPaymentsEnabled: boolean;
}

export interface LateFineAccrualPolicy {
  paused: boolean;
  frozenDays: number;
  frozenAmount: number;
  pausedAt: string | null;
  resumedAt: string | null;
}

export interface RegistrationPolicyDto {
  isOpen: boolean;
  closedMessage: string;
  punishment: RegistrationPunishmentPolicy;
  finePayment: FinePaymentPolicy;
  lateFineAccrual: LateFineAccrualPolicy;
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
    requiredProof: true,
    verificationContact: '',
    partialPaymentsEnabled: false,
  },
  lateFineAccrual: {
    paused: false,
    frozenDays: 0,
    frozenAmount: 0,
    pausedAt: null,
    resumedAt: null,
  },
  version: 0,
  updatedAt: null,
  closedAt: null,
  reopenedAt: null,
};
