import mongoose, { Schema } from 'mongoose';

const StorageDeletionOutboxSchema = new Schema({
  key: { type: String, required: true, unique: true, trim: true, maxlength: 500 },
  bytes: { type: Number, required: true, min: 0 },
  reservedBytes: { type: Number, default: 0, min: 0 },
  verifiedBytes: { type: Number, default: null, min: 0 },
  reason: { type: String, required: true, trim: true, maxlength: 100 },
  state: { type: String, enum: ['pending', 'processing', 'dead-letter'], default: 'pending' },
  attempts: { type: Number, default: 0, min: 0 },
  nextAttemptAt: { type: Date, required: true, default: Date.now },
  lockedUntil: { type: Date, default: null },
  lockToken: { type: String, default: null, maxlength: 64 },
  lastErrorCode: { type: String, default: '', maxlength: 100 },
  deadLetteredAt: { type: Date, default: null },
}, { timestamps: true });

StorageDeletionOutboxSchema.index({ state: 1, nextAttemptAt: 1, _id: 1 });
StorageDeletionOutboxSchema.index({ state: 1, lockedUntil: 1, _id: 1 });
StorageDeletionOutboxSchema.index({ state: 1, deadLetteredAt: 1, _id: 1 });

const StorageDeletionOutbox = mongoose.models.StorageDeletionOutbox
  || mongoose.model('StorageDeletionOutbox', StorageDeletionOutboxSchema);

export default StorageDeletionOutbox;
