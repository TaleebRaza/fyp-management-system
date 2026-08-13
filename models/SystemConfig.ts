// models/SystemConfig.ts
import mongoose, { Schema } from 'mongoose';

const SystemConfigSchema = new Schema({
  configKey: { type: String, required: true, unique: true },
  usedBytes: { type: Number, default: 0, min: 0 },
  reservedBytes: { type: Number, default: 0, min: 0 },
  portalPaused: { type: Boolean, default: false },
  portalPauseReason: { type: String, trim: true, maxlength: 500, default: '' },
}, { timestamps: true });

const SystemConfig = mongoose.models.SystemConfig || mongoose.model('SystemConfig', SystemConfigSchema);

export default SystemConfig;
