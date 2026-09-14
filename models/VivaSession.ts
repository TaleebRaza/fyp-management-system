import mongoose, { Schema } from 'mongoose';

const VivaFactorSnapshotSchema = new Schema(
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
    factors: { type: [VivaFactorSnapshotSchema], required: true },
    targetPanelSize: { type: Number, required: true, min: 2 },
    minimumPanelSize: { type: Number, required: true, min: 2 },
    vivaDurationMinutes: { type: Number, required: true, min: 0 },
    extraGradingDurationMinutes: { type: Number, required: true, min: 0 },
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
    chair: { type: VivaPersonSnapshotSchema, required: true },
    examiners: { type: [VivaPersonSnapshotSchema], required: true },
  },
  { _id: false }
);

const VivaScoreSchema = new Schema(
  {
    factorId: { type: String, required: true, trim: true, maxlength: 80 },
    value: { type: Number, required: true, min: 0, max: 10 },
    source: { type: String, enum: ['examiner', 'deadline'], required: true },
    recordedAt: { type: Date, default: null },
  },
  { _id: false }
);

VivaScoreSchema.path('value').validate(function (this: { get(path: string): unknown }, value: unknown) {
  if (!Number.isInteger(value)) return false;
  return this.get('source') === 'deadline'
    ? value === 0
    : typeof value === 'number' && value >= 1 && value <= 10;
}, 'Examiner scores must be whole numbers from 1 through 10, and deadline scores must be zero.');

const VivaExaminerSheetSchema = new Schema(
  {
    examiner: { type: VivaPersonSnapshotSchema, required: true },
    scores: { type: [VivaScoreSchema], default: [] },
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
    extraGradingEndsAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, trim: true, maxlength: 1_000, default: '' },
    publishedAt: { type: Date, default: null },
    roundSnapshot: { type: VivaRoundSnapshotSchema, default: undefined },
    projectSnapshot: { type: VivaProjectSnapshotSchema, default: undefined },
    panelSnapshot: { type: VivaPanelSnapshotSchema, default: undefined },
    examinerSheets: { type: [VivaExaminerSheetSchema], default: [] },
    version: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Cancelled attempts leave this index, allowing one replacement attempt for the same team.
VivaSessionSchema.index(
  { roundId: 1, projectId: 1 },
  { unique: true, partialFilterExpression: { cancelledAt: null } }
);
VivaSessionSchema.index({ roundId: 1, scheduledAt: 1 });

const VivaSession = mongoose.models.VivaSession || mongoose.model('VivaSession', VivaSessionSchema);

export default VivaSession;
