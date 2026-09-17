import mongoose, { Schema } from 'mongoose';

import { isVivaPanelAdmin } from '../lib/viva';

const VivaPanelSchema = new Schema(
  {
    roundId: { type: Schema.Types.ObjectId, ref: 'VivaRound', required: true },
    examinerIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    panelAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Assigned by the first saved automatic schedule and retained for the panel's lifetime.
    locationLabel: { type: String, trim: true, maxlength: 160, default: '' },
    // Retained for panels created before panel-admin assignment replaced the chair role.
    chairId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

VivaPanelSchema.pre('validate', function () {
  const examinerIds = this.get('examinerIds');
  const normalizedExaminerIds = Array.isArray(examinerIds)
    ? examinerIds.map((examinerId) => String(examinerId))
    : [];

  if (new Set(normalizedExaminerIds).size !== normalizedExaminerIds.length) {
    this.invalidate('examinerIds', 'An examiner can appear only once in a panel.');
  }

  if (!isVivaPanelAdmin(normalizedExaminerIds, String(this.get('panelAdminId') || ''))) {
    this.invalidate('panelAdminId', 'The panel admin must be a unique member of the panel.');
  }
});

// A multikey unique index allows each examiner to appear in one panel per round.
VivaPanelSchema.index({ roundId: 1, examinerIds: 1 }, { unique: true });
VivaPanelSchema.index({ examinerIds: 1 });

const VivaPanel = mongoose.models.VivaPanel || mongoose.model('VivaPanel', VivaPanelSchema);

export default VivaPanel;
