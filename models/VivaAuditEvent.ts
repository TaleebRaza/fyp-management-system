import mongoose, { Schema } from 'mongoose';

export const VIVA_AUDIT_EVENT_TYPES = [
  'round-created',
  'round-updated',
  'round-confirmed',
  'panel-created',
  'panel-updated',
  'session-scheduled',
  'session-started',
  'session-panel-swapped',
  'session-requeued',
  // Retained because historic factor-score audit records remain immutable.
  'score-recorded',
  'grade-recorded',
  'session-finalized',
  'session-cancelled',
  'result-published',
] as const;

export type VivaAuditEventType = (typeof VIVA_AUDIT_EVENT_TYPES)[number];

const VivaAuditEventSchema = new Schema(
  {
    roundId: { type: Schema.Types.ObjectId, ref: 'VivaRound', required: true, immutable: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'VivaSession', default: null, immutable: true },
    event: { type: String, enum: VIVA_AUDIT_EVENT_TYPES, required: true, immutable: true },
    actorId: { type: String, required: true, trim: true, maxlength: 64, immutable: true },
    actorRole: {
      type: String,
      enum: ['admin', 'supervisor', 'student'],
      required: true,
      immutable: true,
    },
    actorName: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
    actorRollNo: { type: String, required: true, trim: true, maxlength: 40, immutable: true },
    occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  },
  { timestamps: true }
);

VivaAuditEventSchema.index({ roundId: 1, occurredAt: -1 });
VivaAuditEventSchema.index({ sessionId: 1, occurredAt: -1 });

const VivaAuditEvent = mongoose.models.VivaAuditEvent
  || mongoose.model('VivaAuditEvent', VivaAuditEventSchema);

export default VivaAuditEvent;
