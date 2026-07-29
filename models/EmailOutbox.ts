import mongoose, { Schema } from 'mongoose';

const EmailOutboxSchema = new Schema({
  dedupeKey: { type: String, required: true, unique: true, trim: true, maxlength: 200 },
  to: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  subject: { type: String, required: true, trim: true, maxlength: 200 },
  html: { type: String, required: true, maxlength: 100_000 },
  text: { type: String, default: '', maxlength: 20_000 },
  state: { type: String, enum: ['pending', 'processing', 'sent', 'dead-letter'], default: 'pending' },
  attempts: { type: Number, default: 0, min: 0 },
  nextAttemptAt: { type: Date, required: true, default: Date.now },
  lockedUntil: { type: Date, default: null },
  lockToken: { type: String, default: null, maxlength: 64 },
  lastErrorCode: { type: String, default: '', maxlength: 100 },
  deadLetteredAt: { type: Date, default: null },
  sentAt: { type: Date, default: null },
}, { timestamps: true });

EmailOutboxSchema.index({ state: 1, nextAttemptAt: 1, _id: 1 });
EmailOutboxSchema.index({ state: 1, lockedUntil: 1, _id: 1 });
EmailOutboxSchema.index({ state: 1, deadLetteredAt: 1, _id: 1 });

const EmailOutbox = mongoose.models.EmailOutbox
  || mongoose.model('EmailOutbox', EmailOutboxSchema);

export default EmailOutbox;
