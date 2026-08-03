import mongoose, { Schema } from 'mongoose';

const VoiceNoteQuotaSchema = new Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  count: { type: Number, required: true, min: 0 },
});

VoiceNoteQuotaSchema.index({ ownerId: 1, projectId: 1 }, { unique: true });

const VoiceNoteQuota = mongoose.models.VoiceNoteQuota
  || mongoose.model('VoiceNoteQuota', VoiceNoteQuotaSchema);

export default VoiceNoteQuota;
