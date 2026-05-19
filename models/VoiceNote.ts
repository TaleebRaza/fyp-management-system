import mongoose, { Schema } from 'mongoose';

const VoiceNoteSchema = new Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  blobUrl: { type: String, required: true },
  
  // Garbage Collection Triggers
  isPlayed: { type: Boolean, default: false },
  playedAt: { type: Date, default: null },
}, { timestamps: true });

// Index for lightning-fast fetching and garbage collection scanning
VoiceNoteSchema.index({ projectId: 1, playedAt: 1 });

const VoiceNote = mongoose.models.VoiceNote || mongoose.model('VoiceNote', VoiceNoteSchema);

export default VoiceNote;