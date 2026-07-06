// models/Project.ts
import mongoose, { Schema } from 'mongoose';

const ProjectSchema = new Schema({
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  inviteCode: { type: String, required: true, unique: true },
  
  title: { type: String, default: '' },
  titleFingerprint: { type: String, default: '', index: true },
  domain: { type: String, default: '' },
  pdfUrl: { type: String, default: '' },
  pdfSize: { type: Number, default: 0 }, // <-- NEW: track size of the uploaded PDF
  status: { type: String, default: 'Pending' },
  
  maxTeamSize: { type: Number, default: 2 },

  stage: { 
    type: String, 
    enum: ['PROPOSAL', 'THESIS_DRAFT', 'FINAL_DELIVERABLES'], 
    default: 'PROPOSAL' 
  }
}, { timestamps: true });

const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema);
export default Project;