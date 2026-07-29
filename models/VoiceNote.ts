// models/VoiceNote.ts
import mongoose, { Schema } from 'mongoose';

const VoiceNoteSchema = new Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  blobUrl: { type: String, required: true, unique: true },
  fileSize: { type: Number, required: true }, // <-- NEW: size in bytes
  isPlayed: { type: Boolean, default: false },
  playedAt: { type: Date, default: null },
}, { timestamps: true });

VoiceNoteSchema.index({ projectId: 1, playedAt: 1 });

const VoiceNote = mongoose.models.VoiceNote || mongoose.model('VoiceNote', VoiceNoteSchema);
export default VoiceNote;
