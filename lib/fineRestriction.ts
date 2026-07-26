export const FINE_RESTRICTION_CODE = 'FINE_RESTRICTION';

export const OUTSTANDING_STUDENT_FINE_FILTER = {
  role: 'student',
  $or: [
    {
      lateRegistrationFine: { $gt: 0 },
      lateRegistrationFineStatus: { $nin: ['resolved', 'waived'] },
    },
    {
      'registrationPunishment.active': true,
      'registrationPunishment.category': 'fine',
      'registrationPunishment.amount': { $gt: 0 },
      'registrationPunishment.status': { $nin: ['resolved', 'waived'] },
    },
  ],
};

export type FinePaymentDetails = {
  methodLabel: string;
  accountTitle: string;
  accountNumber: string;
  instructions: string;
};

export type FineRestrictionSummary = {
  active: true;
  lateRegistrationFine: {
    amount: number;
    daysLate: number;
    status: 'pending';
  } | null;
  adminFine: {
    amount: number;
    title: string;
    description: string;
    status: 'pending';
  } | null;
  totalAmount: number;
};

const isOutstanding = (status: unknown) => status !== 'resolved' && status !== 'waived';

export type FineRestrictedUser = {
  lateRegistrationFine?: unknown;
  lateRegistrationFineStatus?: unknown;
  lateRegistrationDays?: unknown;
  registrationPunishment?: {
    amount?: unknown;
    active?: boolean;
    category?: unknown;
    status?: unknown;
    title?: unknown;
    description?: unknown;
  } | null;
};

export function buildFineRestriction(user: FineRestrictedUser | null | undefined): FineRestrictionSummary | null {
  if (!user) return null;

  const lateAmount = Math.max(Math.round(Number(user.lateRegistrationFine) || 0), 0);
  const lateRegistrationFine =
    lateAmount > 0 && isOutstanding(user.lateRegistrationFineStatus)
      ? {
          amount: lateAmount,
          daysLate: Math.max(Math.trunc(Number(user.lateRegistrationDays) || 0), 0),
          status: 'pending' as const,
        }
      : null;

  const punishment = user.registrationPunishment || {};
  const adminAmount = Math.max(Math.round(Number(punishment.amount) || 0), 0);
  const adminFine =
    punishment.active === true &&
    punishment.category === 'fine' &&
    adminAmount > 0 &&
    isOutstanding(punishment.status)
      ? {
          amount: adminAmount,
          title: String(punishment.title || 'Administrative fine').trim() || 'Administrative fine',
          description: String(punishment.description || '').trim(),
          status: 'pending' as const,
        }
      : null;

  if (!lateRegistrationFine && !adminFine) return null;

  return {
    active: true,
    lateRegistrationFine,
    adminFine,
    totalAmount: (lateRegistrationFine?.amount || 0) + (adminFine?.amount || 0),
  };
}
