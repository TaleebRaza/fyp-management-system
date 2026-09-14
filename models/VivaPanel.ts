import mongoose, { Schema } from 'mongoose';

const VivaPanelSchema = new Schema(
  {
    roundId: { type: Schema.Types.ObjectId, ref: 'VivaRound', required: true },
    examinerIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
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

  const chairId = this.get('chairId');
  if (chairId && !normalizedExaminerIds.includes(String(chairId))) {
    this.invalidate('chairId', 'The panel chair must be an examiner in the panel.');
  }
});

// A multikey unique index allows each examiner to appear in one panel per round.
VivaPanelSchema.index({ roundId: 1, examinerIds: 1 }, { unique: true });

const VivaPanel = mongoose.models.VivaPanel || mongoose.model('VivaPanel', VivaPanelSchema);

export default VivaPanel;
