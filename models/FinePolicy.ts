import mongoose, { Schema } from 'mongoose';
import { FINE_RESTRICTIONS } from '../types/fines';

const PausePeriodSchema = new Schema(
  {
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
  },
  { _id: false }
);

const CalculationSchema = new Schema(
  {
    method: {
      type: String,
      enum: ['fixed', 'daily', 'starting-plus-daily'],
      required: true,
    },
    fixedAmount: { type: Number, min: 0, default: 0 },
    startingAmount: { type: Number, min: 0, default: 0 },
    dailyAmount: { type: Number, min: 0, default: 0 },
    maximumAmount: { type: Number, min: 0, default: null },
  },
  { _id: false }
);

const FinePolicySchema = new Schema(
  {
    fineTypeId: { type: Schema.Types.ObjectId, ref: 'FineType', required: true },
    version: { type: Number, required: true, min: 1 },
    trigger: {
      type: String,
      enum: ['late-registration', 'late-submission', 'manual'],
      required: true,
    },
    status: { type: String, enum: ['active', 'paused', 'inactive'], default: 'active' },
    deadline: { type: Date, default: null },
    gracePeriodDays: { type: Number, min: 0, default: 0 },
    timeZone: { type: String, trim: true, maxlength: 80, default: 'Asia/Karachi' },
    calculation: { type: CalculationSchema, required: true },
    applicablePrograms: [{ type: String, trim: true, maxlength: 32 }],
    applicableBatches: [{ type: String, trim: true, maxlength: 40 }],
    effectiveFrom: { type: Date, required: true },
    submissionStage: { type: String, trim: true, maxlength: 80, default: null },
    liabilityMode: {
      type: String,
      enum: ['individual', 'all-members', 'shared-team'],
      default: 'individual',
    },
    acceptedSubmissionStopsAccrual: { type: Boolean, default: true },
    rejectedSubmissionMode: {
      type: String,
      enum: ['continue', 'resume-on-rejection', 'reset-from-resubmission'],
      default: 'continue',
    },
    disputesAllowed: { type: Boolean, default: true },
    defaultRestrictions: [{ type: String, enum: FINE_RESTRICTIONS }],
    pausePeriods: { type: [PausePeriodSchema], default: [] },
    supersedesPolicyId: { type: Schema.Types.ObjectId, ref: 'FinePolicy', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

FinePolicySchema.index({ fineTypeId: 1, version: 1 }, { unique: true });
FinePolicySchema.index({ trigger: 1, status: 1, submissionStage: 1, effectiveFrom: -1 });

export default mongoose.models.FinePolicy || mongoose.model('FinePolicy', FinePolicySchema);
