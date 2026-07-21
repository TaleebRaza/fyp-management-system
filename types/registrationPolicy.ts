export type RegistrationPunishmentCategory = 'fine' | 'other';

export interface RegistrationPunishmentPolicy {
  enabled: boolean;
  category: RegistrationPunishmentCategory;
  title: string;
  description: string;
  amount: number;
}

export interface RegistrationPolicyDto {
  isOpen: boolean;
  closedMessage: string;
  punishment: RegistrationPunishmentPolicy;
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
  version: 0,
  updatedAt: null,
  closedAt: null,
  reopenedAt: null,
};
