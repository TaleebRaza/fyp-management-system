import mongoose, { Schema } from 'mongoose';

const VivaParticipantLockSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'VivaSession', required: true },
    participantType: { type: String, enum: ['student', 'examiner'], required: true },
    restrictPortal: { type: Boolean, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

VivaParticipantLockSchema.index({ userId: 1 }, { unique: true });
VivaParticipantLockSchema.index({ sessionId: 1 });

const VivaParticipantLock = mongoose.models.VivaParticipantLock
  || mongoose.model('VivaParticipantLock', VivaParticipantLockSchema);

export default VivaParticipantLock;
