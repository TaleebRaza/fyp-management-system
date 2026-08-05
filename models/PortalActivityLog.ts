import mongoose, { Schema } from 'mongoose';
import { PORTAL_ACTIVITY_ACTIONS } from '../lib/portalActivityLogPolicy';

const PortalActivityEntrySchema = new Schema(
  {
    action: { type: String, enum: PORTAL_ACTIVITY_ACTIONS, required: true, maxlength: 80 },
    actorId: { type: String, required: true, maxlength: 64 },
    actorRole: {
      type: String,
      enum: ['admin', 'supervisor', 'student'],
      required: true,
    },
    actorName: { type: String, trim: true, maxlength: 100 },
    actorRollNo: { type: String, trim: true, maxlength: 40 },
    occurredAt: { type: Date, required: true },
  },
  { _id: false }
);

const PortalActivityLogSchema = new Schema(
  {
    _id: { type: String },
    entries: { type: [PortalActivityEntrySchema], default: [] },
  },
  { versionKey: false }
);

const PortalActivityLog =
  mongoose.models.PortalActivityLog
  || mongoose.model('PortalActivityLog', PortalActivityLogSchema);

export default PortalActivityLog;
