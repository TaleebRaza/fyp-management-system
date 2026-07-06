// models/SystemConfig.ts
import mongoose, { Schema } from 'mongoose';

const SystemConfigSchema = new Schema({
  configKey: { type: String, required: true, unique: true, index: true },
  usedBytes: { type: Number, default: 0 }
}, { timestamps: true });

const SystemConfig = mongoose.models.SystemConfig || mongoose.model('SystemConfig', SystemConfigSchema);

export default SystemConfig;