import mongoose, { Schema } from 'mongoose';

import { getVivaGradeResult, VIVA_GRADE_SCALE } from '../lib/viva';

const LegacyVivaFactorSnapshotSchema = new Schema(
  {
    id: { type: String, required: true, trim: true, maxlength: 80 },
    label: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { _id: false }
);

const VivaPersonSnapshotSchema = new Schema(
  {
    userId: { type: String, required: true, trim: true, maxlength: 64 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    rollNo: { type: String, required: true, trim: true, maxlength: 40 },
  },
  { _id: false }
);

const VivaRoundSnapshotSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Retained for session history created by the factor-based workflow.
    factors: { type: [LegacyVivaFactorSnapshotSchema], default: undefined },
    targetPanelSize: { type: Number, required: true, min: 2 },
    minimumPanelSize: { type: Number, required: true, min: 2 },
    vivaDurationMinutes: { type: Number, required: true, min: 0 },
    extraGradingDurationMinutes: { type: Number, default: null, min: 0 },
  },
  { _id: false }
);

const VivaProjectSnapshotSchema = new Schema(
  {
    projectId: { type: String, required: true, trim: true, maxlength: 64 },
    title: { type: String, default: '', maxlength: 300 },
    description: { type: String, default: '', maxlength: 10_000 },
    domains: { type: [String], default: [] },
    tools: { type: String, default: '', maxlength: 2_000 },
    pdfUrl: { type: String, default: '', maxlength: 500 },
    pdfSize: { type: Number, default: 0, min: 0 },
    members: { type: [VivaPersonSnapshotSchema], required: true },
    supervisor: { type: VivaPersonSnapshotSchema, default: undefined },
  },
  { _id: false }
);

const VivaPanelSnapshotSchema = new Schema(
  {
    panelId: { type: String, required: true, trim: true, maxlength: 64 },
    panelAdmin: { type: VivaPersonSnapshotSchema, default: undefined },
    // Retained for session history created before panel-admin assignment existed.
    chair: { type: VivaPersonSnapshotSchema, default: undefined },
    examiners: { type: [VivaPersonSnapshotSchema], required: true },
  },
  { _id: false }
);

const VivaGradeResultSchema = new Schema(
  {
    grade: { type: String, enum: VIVA_GRADE_SCALE.map(({ grade }) => grade), required: true },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    selectedAt: { type: Date, required: true },
  },
  { _id: false }
);

const LegacyVivaScoreSchema = new Schema(
  {
    factorId: { type: String, required: true, trim: true, maxlength: 80 },
    value: { type: Number, required: true, min: 0, max: 10 },
    source: { type: String, enum: ['examiner', 'deadline'], required: true },
    recordedAt: { type: Date, default: null },
  },
  { _id: false }
);

const LegacyVivaExaminerSheetSchema = new Schema(
  {
    examiner: { type: VivaPersonSnapshotSchema, required: true },
    scores: { type: [LegacyVivaScoreSchema], default: [] },
  },
  { _id: false }
);

const VivaSessionSchema = new Schema(
  {
    roundId: { type: Schema.Types.ObjectId, ref: 'VivaRound', required: true },
    panelId: { type: Schema.Types.ObjectId, ref: 'VivaPanel', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    scheduledAt: { type: Date, default: null },
    locationLabel: { type: String, trim: true, maxlength: 160, default: '' },
    startedAt: { type: Date, default: null },
    vivaEndsAt: { type: Date, default: null },
    // Retained for sessions created before the factor workflow was removed.
    extraGradingEndsAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, trim: true, maxlength: 1_000, default: '' },
    publishedAt: { type: Date, default: null },
    roundSnapshot: { type: VivaRoundSnapshotSchema, default: undefined },
    projectSnapshot: { type: VivaProjectSnapshotSchema, default: undefined },
    panelSnapshot: { type: VivaPanelSnapshotSchema, default: undefined },
    result: { type: VivaGradeResultSchema, default: undefined },
    examinerSheets: { type: [LegacyVivaExaminerSheetSchema], default: undefined },
    version: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

VivaSessionSchema.pre('validate', function () {
  const result = this.get('result');
  if (!result) return;

  const canonicalResult = getVivaGradeResult(this.get('result.grade'));
  if (!canonicalResult || this.get('result.percentage') !== canonicalResult.percentage) {
    this.invalidate('result', 'A Viva result must use its canonical grade percentage.');
  }
});

// Cancelled attempts leave this index, allowing one replacement attempt for the same team.
VivaSessionSchema.index(
  { roundId: 1, projectId: 1 },
  { unique: true, partialFilterExpression: { cancelledAt: null } }
);
VivaSessionSchema.index({ roundId: 1, scheduledAt: 1 });
VivaSessionSchema.index({ cancelledAt: 1, completedAt: 1, scheduledAt: 1, vivaEndsAt: 1 });
VivaSessionSchema.index({
  'panelSnapshot.examiners.userId': 1,
  completedAt: 1,
  cancelledAt: 1,
  startedAt: 1,
});

const VivaSession = mongoose.models.VivaSession || mongoose.model('VivaSession', VivaSessionSchema);

export default VivaSession;
