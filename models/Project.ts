// models/Project.ts
import mongoose, { Schema } from 'mongoose';
import { DEFAULT_PROJECT_STAGE, PROJECT_STAGES } from '../config/appSettings';

const ProjectSchema = new Schema({
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  inviteCode: { type: String, required: true, unique: true },
  
  title: { type: String, default: '' },
  titleFingerprint: { type: String, default: '', index: true },
  // Legacy display string retained for backwards compatibility and exports.
  domain: { type: String, default: '' },
  // Canonical multi-select project domain identifiers.
  domains: { type: [String], default: [] },
  pdfUrl: { type: String, default: '' },
  pdfSize: { type: Number, default: 0 }, // <-- NEW: track size of the uploaded PDF
  status: { type: String, default: 'Pending' },
  
  stage: { 
    type: String, 
    enum: PROJECT_STAGES,
    default: DEFAULT_PROJECT_STAGE,
  }
}, { timestamps: true });

const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema);
export default Project;
