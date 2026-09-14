import mongoose, { Schema } from 'mongoose';

import { validateVivaConfiguration } from '../lib/viva';

const VivaFactorSchema = new Schema(
  {
    id: { type: String, required: true, trim: true, maxlength: 80 },
    label: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { _id: false }
);

const VivaRoundSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    factors: { type: [VivaFactorSchema], required: true },
    targetPanelSize: { type: Number, required: true, min: 2 },
    minimumPanelSize: { type: Number, required: true, min: 2 },
    vivaDurationMinutes: { type: Number, required: true, min: 0 },
    extraGradingDurationMinutes: { type: Number, required: true, min: 0 },
    projectIds: [{ type: Schema.Types.ObjectId, ref: 'Project' }],
    examinerIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    frozenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

VivaRoundSchema.pre('validate', function () {
  const validation = validateVivaConfiguration({
    factors: this.get('factors'),
    targetPanelSize: this.get('targetPanelSize'),
    minimumPanelSize: this.get('minimumPanelSize'),
    vivaDurationMinutes: this.get('vivaDurationMinutes'),
    extraGradingDurationMinutes: this.get('extraGradingDurationMinutes'),
  });

  if (!validation.success) {
    for (const error of validation.errors) this.invalidate(error, 'Invalid Viva round configuration.');
    return;
  }

  this.set('factors', validation.configuration.factors);
});

VivaRoundSchema.index({ createdAt: -1 });

const VivaRound = mongoose.models.VivaRound || mongoose.model('VivaRound', VivaRoundSchema);

export default VivaRound;
