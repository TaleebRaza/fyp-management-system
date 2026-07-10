import mongoose, { Schema } from 'mongoose';

const PendingVerificationSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  rollNo: { type: String, required: true, trim: true, uppercase: true },
  passwordHash: { type: String, required: true },
  program: { type: String, required: true },
  batch: { type: String, required: true },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verificationPhrase: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'action_required', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  },
  adminRemark: { type: String, default: '' },
  remarkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  remarkedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
}, {
  timestamps: true,
});

PendingVerificationSchema.index({ status: 1, createdAt: -1 });
PendingVerificationSchema.index({ email: 1, status: 1 });
PendingVerificationSchema.index({ rollNo: 1, status: 1 });
PendingVerificationSchema.index({ email: 1, rollNo: 1, createdAt: -1 });

const PendingVerification =
  mongoose.models.PendingVerification ||
  mongoose.model('PendingVerification', PendingVerificationSchema);

export default PendingVerification;