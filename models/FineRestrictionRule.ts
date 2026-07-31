import mongoose, { Schema } from 'mongoose';
import { FINE_RESTRICTIONS } from '../types/fines';

const FineRestrictionRuleSchema = new Schema(
  {
    scope: {
      type: String,
      enum: ['global', 'fine-type', 'program-batch', 'project-team', 'student', 'fine-record'],
      required: true,
    },
    fineTypeId: { type: Schema.Types.ObjectId, ref: 'FineType', default: null },
    program: { type: String, trim: true, maxlength: 32, default: null },
    batch: { type: String, trim: true, maxlength: 40, default: null },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fineRecordId: { type: Schema.Types.ObjectId, ref: 'StudentFine', default: null },
    restrictions: [{ type: String, enum: FINE_RESTRICTIONS }],
    active: { type: Boolean, default: true },
    label: { type: String, required: true, trim: true, maxlength: 160 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

FineRestrictionRuleSchema.index({ active: 1, scope: 1, fineTypeId: 1, studentId: 1, projectId: 1 });

export default
  mongoose.models.FineRestrictionRule ||
  mongoose.model('FineRestrictionRule', FineRestrictionRuleSchema);
