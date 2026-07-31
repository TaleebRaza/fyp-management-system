import mongoose, { Schema } from 'mongoose';
import { FINE_RESTRICTIONS, FINE_STATUSES } from '../types/fines';

const PausePeriodSchema = new Schema(
  {
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
  },
  { _id: false }
);

const CalculationSnapshotSchema = new Schema(
  {
    method: { type: String, enum: ['fixed', 'daily', 'starting-plus-daily'], required: true },
    fixedAmount: { type: Number, min: 0, default: 0 },
    startingAmount: { type: Number, min: 0, default: 0 },
    dailyAmount: { type: Number, min: 0, default: 0 },
    maximumAmount: { type: Number, min: 0, default: null },
    timeZone: { type: String, required: true },
  },
  { _id: false }
);

const HistorySchema = new Schema(
  {
    action: { type: String, required: true, trim: true, maxlength: 80 },
    details: { type: String, required: true, trim: true, maxlength: 2_000 },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const AdjustmentSchema = new Schema(
  {
    kind: { type: String, enum: ['discount', 'charge'], required: true },
    amount: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true, trim: true, maxlength: 1_000 },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const RestorationSnapshotSchema = new Schema(
  {
    action: {
      type: String,
      enum: ['supervisor-disband-project', 'supervisor-detach-student', 'team-membership'],
      required: true,
    },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    supervisorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    memberIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    reason: { type: String, required: true, trim: true, maxlength: 1_000 },
    appliedAt: { type: Date, required: true },
  },
  { _id: false }
);

const StudentFineSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fineTypeId: { type: Schema.Types.ObjectId, ref: 'FineType', required: true },
    policyId: { type: Schema.Types.ObjectId, ref: 'FinePolicy', required: true },
    policyVersion: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    reason: { type: String, required: true, trim: true, maxlength: 1_000 },
    originalAmount: { type: Number, required: true, min: 0 },
    currentAmount: { type: Number, required: true, min: 0 },
    accruedAmount: { type: Number, required: true, min: 0 },
    settledAmount: { type: Number, min: 0, default: 0 },
    adjustments: { type: [AdjustmentSchema], default: [] },
    deadline: { type: Date, default: null },
    gracePeriodDays: { type: Number, min: 0, default: 0 },
    lateDays: { type: Number, min: 0, default: 0 },
    calculation: { type: CalculationSnapshotSchema, required: true },
    imposedAmount: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: FINE_STATUSES, required: true },
    administrativeNotes: { type: String, trim: true, maxlength: 4_000, default: '' },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    projectStage: { type: String, trim: true, maxlength: 80, default: null },
    submissionDeadline: { type: Date, default: null },
    relevantStudentIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    liabilityMode: {
      type: String,
      enum: ['individual', 'all-members', 'shared-team'],
      default: 'individual',
    },
    liabilityShareNumerator: { type: Number, min: 0, default: 1 },
    liabilityShareDenominator: { type: Number, min: 1, default: 1 },
    liabilityShareIndex: { type: Number, min: 0, default: 0 },
    disputesAllowed: { type: Boolean, default: true },
    policyRestrictions: [{ type: String, enum: FINE_RESTRICTIONS }],
    restrictionOverrideEnabled: { type: Boolean, default: false },
    restrictionOverride: [{ type: String, enum: FINE_RESTRICTIONS }],
    pausePeriods: { type: [PausePeriodSchema], default: [] },
    accrualStoppedAt: { type: Date, default: null },
    deduplicationKey: { type: String, required: true, unique: true, maxlength: 500 },
    generationKey: { type: String, required: true, maxlength: 160 },
    history: { type: [HistorySchema], default: [] },
    restorationSnapshots: { type: [RestorationSnapshotSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

StudentFineSchema.index({ studentId: 1, status: 1, updatedAt: -1 });
StudentFineSchema.index({ projectId: 1, status: 1 });
StudentFineSchema.index({ fineTypeId: 1, policyVersion: 1, projectStage: 1 });

export default mongoose.models.StudentFine || mongoose.model('StudentFine', StudentFineSchema);
