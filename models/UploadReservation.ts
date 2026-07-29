import mongoose, { Schema } from 'mongoose';

const UploadReservationSchema = new Schema({
  key: { type: String, required: true, unique: true, trim: true, maxlength: 500 },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['pdf', 'voice', 'broadcast'], required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  expectedBytes: { type: Number, required: true, min: 1 },
  expectedContentType: { type: String, required: true, trim: true, maxlength: 100 },
  actualBytes: { type: Number, default: 0, min: 0 },
  actualContentType: { type: String, default: '', maxlength: 100 },
  state: { type: String, enum: ['pending', 'finalized', 'cancelled'], default: 'pending' },
  idempotencyKey: { type: String, required: true, trim: true, maxlength: 128 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

UploadReservationSchema.index({ ownerId: 1, idempotencyKey: 1 }, { unique: true });
UploadReservationSchema.index({ state: 1, expiresAt: 1, _id: 1 });

const UploadReservation = mongoose.models.UploadReservation
  || mongoose.model('UploadReservation', UploadReservationSchema);

export default UploadReservation;
