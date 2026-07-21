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

const RegistrationPolicySchema = new Schema(
  {
    policyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
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
    version: { type: Number, min: 0, default: 0 },
    registrationsAccepted: { type: Number, min: 0, default: 0 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    closedAt: { type: Date, default: null },
    reopenedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.RegistrationPolicy ||
  mongoose.model('RegistrationPolicy', RegistrationPolicySchema);
