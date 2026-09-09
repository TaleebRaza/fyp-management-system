// models/SystemConfig.ts
import mongoose, { Schema } from 'mongoose';

const RetentionCategorySchema = new Schema({
  enabled: { type: Boolean, required: true },
  ageDays: { type: Number, required: true, min: 1, max: 3_650 },
}, { _id: false });

const RetentionSettingsSchema = new Schema({
  schedule: {
    enabled: { type: Boolean, required: true },
    timezone: { type: String, required: true, trim: true, maxlength: 100 },
    time: { type: String, required: true, trim: true, maxlength: 5 },
  },
  playedVoiceNotes: { type: RetentionCategorySchema, required: true },
  unplayedVoiceNotes: { type: RetentionCategorySchema, required: true },
  audioBroadcasts: { type: RetentionCategorySchema, required: true },
  unusedPdfUploads: { type: RetentionCategorySchema, required: true },
}, { _id: false });

const RetentionReportSchema = new Schema({
  status: { type: String, required: true, maxlength: 20 },
  scheduledFor: { type: String, default: null, maxlength: 10 },
  completedAt: { type: Date, default: null },
  playedVoiceNotesDeleted: { type: Number, default: 0, min: 0 },
  unplayedVoiceNotesDeleted: { type: Number, default: 0, min: 0 },
  audioBroadcastsCleared: { type: Number, default: 0, min: 0 },
  unusedPdfUploadsQueued: { type: Number, default: 0, min: 0 },
  queuedObjects: { type: Number, default: 0, min: 0 },
  queuedDeletionBytes: { type: Number, default: 0, min: 0 },
  protectedSharedObjects: { type: Number, default: 0, min: 0 },
  skippedInvalidObjects: { type: Number, default: 0, min: 0 },
}, { _id: false });

const SystemConfigSchema = new Schema({
  configKey: { type: String, required: true, unique: true },
  usedBytes: { type: Number, default: 0, min: 0 },
  reservedBytes: { type: Number, default: 0, min: 0 },
  portalPaused: { type: Boolean, default: false },
  portalPauseReason: { type: String, trim: true, maxlength: 500, default: '' },
  portalMaintenance: { type: Boolean, default: false },
  portalMaintenanceReason: { type: String, trim: true, maxlength: 500, default: '' },
  universityName: { type: String, trim: true, maxlength: 120, default: '' },
  primaryColor: { type: String, trim: true, maxlength: 7, default: '' },
  accentColor: { type: String, trim: true, maxlength: 7, default: '' },
  brandingLogo: { type: Buffer, default: null },
  brandingLogoUpdatedAt: { type: Date, default: null },
  bootstrapAdministratorId: { type: Schema.Types.ObjectId, default: null },
  bootstrapCompletedAt: { type: Date, default: null },
  retentionSettings: { type: RetentionSettingsSchema, default: null },
  retentionLastReport: { type: RetentionReportSchema, default: null },
  retentionLastScheduledFor: { type: String, default: null, maxlength: 10 },
  retentionLastRunAt: { type: Date, default: null },
  retentionNextAttemptAt: { type: Date, default: null },
  retentionRunLockedUntil: { type: Date, default: null },
  retentionRunToken: { type: String, default: null, maxlength: 64 },
}, { timestamps: true });

const SystemConfig = mongoose.models.SystemConfig || mongoose.model('SystemConfig', SystemConfigSchema);

export default SystemConfig;
