import mongoose, { Schema } from 'mongoose';

const RegistrationPunishmentPolicySchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    category: { type: String, enum: ['fine', 'other'], default: 'fine' },
    title: { type: String, trim: true, maxlength: 120, default: 'Late registration fine' },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    amount: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const FinePaymentSchema = new Schema(
  {
    methodLabel: { type: String, trim: true, maxlength: 100, default: '' },
    accountTitle: { type: String, trim: true, maxlength: 120, default: '' },
    accountNumber: { type: String, trim: true, maxlength: 120, default: '' },
    instructions: { type: String, trim: true, maxlength: 1500, default: '' },
  },
  { _id: false }
);

const LateFineAccrualSchema = new Schema(
  {
    paused: { type: Boolean, default: false },
    frozenDays: { type: Number, min: 0, default: 0 },
    frozenAmount: { type: Number, min: 0, default: 0 },
    pausedAt: { type: Date, default: null },
    resumedAt: { type: Date, default: null },
  },
  { _id: false }
);

const FineRestrictionPolicySchema = new Schema(
  {
    proposalUpload: { type: Boolean, default: true },
  },
  { _id: false }
);

const RegistrationPolicySchema = new Schema(
  {
    policyKey: {
      type: String,
      required: true,
      unique: true,
      default: 'student-registration',
    },
    isOpen: { type: Boolean, default: true },
    closedMessage: {
      type: String,
      trim: true,
      maxlength: 500,
      default:
        'Student registration is currently closed. Please contact the FYP administration for assistance.',
    },
    projectSubmissionsOpen: { type: Boolean, default: true },
    projectSubmissionsAccepted: { type: Number, min: 0, default: 0 },
    punishment: {
      type: RegistrationPunishmentPolicySchema,
      default: () => ({
        enabled: false,
        category: 'fine',
        title: 'Late registration fine',
        description: '',
        amount: 0,
      }),
    },
    finePayment: {
      type: FinePaymentSchema,
      default: () => ({
        methodLabel: '',
        accountTitle: '',
        accountNumber: '',
        instructions: '',
      }),
    },
    lateFineAccrual: {
      type: LateFineAccrualSchema,
      default: () => ({
        paused: false,
        frozenDays: 0,
        frozenAmount: 0,
        pausedAt: null,
        resumedAt: null,
      }),
    },
    fineRestrictions: {
      type: FineRestrictionPolicySchema,
      default: () => ({ proposalUpload: true }),
    },
    version: { type: Number, min: 0, default: 0 },
    registrationsAccepted: { type: Number, min: 0, default: 0 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    closedAt: { type: Date, default: null },
    reopenedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default
  mongoose.models.RegistrationPolicy ||
  mongoose.model('RegistrationPolicy', RegistrationPolicySchema);
