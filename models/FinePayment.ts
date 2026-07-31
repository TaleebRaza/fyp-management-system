import mongoose, { Schema } from 'mongoose';

const PaymentAllocationSchema = new Schema(
  {
    fineId: { type: Schema.Types.ObjectId, ref: 'StudentFine', required: true },
    amount: { type: Number, min: 0, required: true },
  },
  { _id: false }
);

const FinePaymentSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fineIds: [{ type: Schema.Types.ObjectId, ref: 'StudentFine', required: true }],
    source: { type: String, enum: ['student', 'offline'], default: 'student' },
    status: {
      type: String,
      enum: ['submitted', 'under-verification', 'accepted', 'rejected'],
      default: 'submitted',
    },
    reference: { type: String, required: true, trim: true, maxlength: 160 },
    paidAmount: { type: Number, required: true, min: 1 },
    paymentDate: { type: Date, required: true },
    proofKey: { type: String, trim: true, maxlength: 500, default: null },
    proofBytes: { type: Number, min: 0, default: 0 },
    proofContentType: { type: String, trim: true, maxlength: 100, default: '' },
    message: { type: String, trim: true, maxlength: 1_000, default: '' },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 128 },
    allocations: { type: [PaymentAllocationSchema], default: [] },
    unallocatedAmount: { type: Number, min: 0, default: 0 },
    rejectionReason: { type: String, trim: true, maxlength: 1_000, default: '' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

FinePaymentSchema.index({ studentId: 1, idempotencyKey: 1 }, { unique: true });
FinePaymentSchema.index({ status: 1, createdAt: -1 });
FinePaymentSchema.index({ fineIds: 1, createdAt: -1 });

export default
  mongoose.models.FinePayment || mongoose.model('FinePayment', FinePaymentSchema);
