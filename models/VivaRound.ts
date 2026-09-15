import mongoose, { Schema } from 'mongoose';

import { validateVivaConfiguration } from '../lib/viva';

const LegacyVivaFactorSchema = new Schema(
  {
    id: { type: String, required: true, trim: true, maxlength: 80 },
    label: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { _id: false }
);

const VivaRoundSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Retained so factor-based rounds created before the grade workflow remain readable.
    factors: { type: [LegacyVivaFactorSchema], default: undefined },
    targetPanelSize: { type: Number, required: true, min: 2 },
    minimumPanelSize: { type: Number, required: true, min: 2 },
    vivaDurationMinutes: { type: Number, required: true, min: 0 },
    extraGradingDurationMinutes: { type: Number, default: null, min: 0 },
    projectIds: [{ type: Schema.Types.ObjectId, ref: 'Project' }],
    examinerIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    frozenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

VivaRoundSchema.pre('validate', function () {
  const validation = validateVivaConfiguration({
    targetPanelSize: this.get('targetPanelSize'),
    minimumPanelSize: this.get('minimumPanelSize'),
    vivaDurationMinutes: this.get('vivaDurationMinutes'),
  });

  if (!validation.success) {
    for (const error of validation.errors) this.invalidate(error, 'Invalid Viva round configuration.');
    return;
  }
});

VivaRoundSchema.index({ createdAt: -1 });

const VivaRound = mongoose.models.VivaRound || mongoose.model('VivaRound', VivaRoundSchema);

export default VivaRound;
