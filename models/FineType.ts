import mongoose, { Schema } from 'mongoose';
import { FINE_RESTRICTIONS } from '../types/fines';

const FineTypeSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 80 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1_000, default: '' },
    category: {
      type: String,
      enum: ['late-registration', 'late-submission', 'manual'],
      required: true,
    },
    active: { type: Boolean, default: true },
    defaultRestrictions: [{ type: String, enum: FINE_RESTRICTIONS }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

FineTypeSchema.index({ category: 1, active: 1 });

export default mongoose.models.FineType || mongoose.model('FineType', FineTypeSchema);
