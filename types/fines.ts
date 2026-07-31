export type FineTypeCategory = 'late-registration' | 'late-submission' | 'manual';

export type FineCalculationMethod = 'fixed' | 'daily' | 'starting-plus-daily';

export type FineStatus =
  | 'scheduled'
  | 'accruing'
  | 'paused'
  | 'pending-payment'
  | 'payment-submitted'
  | 'under-verification'
  | 'paid'
  | 'waived'
  | 'cancelled'
  | 'disputed';

export const FINE_STATUSES: readonly FineStatus[] = [
  'scheduled',
  'accruing',
  'paused',
  'pending-payment',
  'payment-submitted',
  'under-verification',
  'paid',
  'waived',
  'cancelled',
  'disputed',
];

export const TERMINAL_FINE_STATUSES: readonly FineStatus[] = ['paid', 'waived', 'cancelled'];

export type FinePaymentStatus =
  | 'submitted'
  | 'under-verification'
  | 'accepted'
  | 'rejected';

export type FineAdjustmentKind = 'discount' | 'charge';

export type FineLiabilityMode = 'individual' | 'all-members' | 'shared-team';

export type FineRestriction =
  | 'pdf-upload-student'
  | 'pdf-upload-team'
  | 'login-payment-only'
  | 'login-complete'
  | 'supervisor-selection'
  | 'supervisor-disband-project'
  | 'supervisor-detach-student'
  | 'team-membership'
  | 'none';

export const FINE_RESTRICTIONS: readonly FineRestriction[] = [
  'pdf-upload-student',
  'pdf-upload-team',
  'login-payment-only',
  'login-complete',
  'supervisor-selection',
  'supervisor-disband-project',
  'supervisor-detach-student',
  'team-membership',
  'none',
];

export type FineRestrictionScope =
  | 'global'
  | 'fine-type'
  | 'program-batch'
  | 'project-team'
  | 'student'
  | 'fine-record';

export type FinePausePeriod = {
  startedAt: Date | string | number;
  endedAt?: Date | string | number | null;
};

export type FineCalculation = {
  method: FineCalculationMethod;
  fixedAmount?: number;
  startingAmount?: number;
  dailyAmount?: number;
  maximumAmount?: number | null;
};

export type FineCalculationInput = FineCalculation & {
  deadline: Date | string | number;
  effectiveAt: Date | string | number;
  gracePeriodDays?: number;
  timeZone?: string;
  pausePeriods?: FinePausePeriod[];
  accrualStoppedAt?: Date | string | number | null;
  imposedAmount?: number;
};

export type FineCalculationResult = {
  originalAmount: number;
  currentAmount: number;
  accruedAmount: number;
  lateDays: number;
};

export type FineRestrictionSource = {
  fineId: string;
  fineTypeId: string;
  studentId: string;
  restriction: FineRestriction;
  scope: FineRestrictionScope | 'policy';
  sourceId: string;
  sourceLabel: string;
};

export type EffectiveFineRestrictions = {
  restrictions: FineRestriction[];
  sources: FineRestrictionSource[];
  loginMode: 'none' | 'payment-only' | 'complete-lock';
  blocksPdfUpload: boolean;
  blocksTeamPdfUpload: boolean;
  blocksSupervisorSelection: boolean;
  blocksTeamMembership: boolean;
  blockingTeamMember: {
    id: string;
    name: string;
    rollNo: string;
  } | null;
};
