import mongoose, { Schema } from 'mongoose';

const ProjectSchema = new Schema({
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  inviteCode: { type: String, required: true, unique: true },
  
  title: { type: String, default: '' },
  domain: { type: String, default: '' },
  pdfUrl: { type: String, default: '' },
  status: { type: String, default: 'Pending' },

  // --- NEW: Timeline Stage Field ---
  stage: { 
    type: String, 
    enum: ['PROPOSAL', 'THESIS_DRAFT', 'FINAL_DELIVERABLES'], 
    default: 'PROPOSAL' 
  }
  // ---------------------------------
}, { timestamps: true });

const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema);

export default Project;