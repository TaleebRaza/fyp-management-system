import mongoose, { Schema } from 'mongoose';

const FineAuditSchema = new Schema(
  {
    entityType: {
      type: String,
      enum: ['fine-type', 'policy', 'fine-record', 'restriction-rule', 'payment-record'],
      required: true,
    },
    entityId: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, required: true, trim: true, maxlength: 80 },
    details: { type: String, required: true, trim: true, maxlength: 4_000 },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

FineAuditSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
FineAuditSchema.index({ actorId: 1, createdAt: -1 });

export default mongoose.models.FineAudit || mongoose.model('FineAudit', FineAuditSchema);
