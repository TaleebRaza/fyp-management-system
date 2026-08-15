// models/Project.ts
import mongoose, { Schema } from 'mongoose';

const RatingSnapshotSchema = new Schema({
  projectIdea: {
    type: Number,
    required: true,
    min: 1,
    max: 10,
    validate: Number.isInteger,
  },
  technicalMerit: {
    type: Number,
    required: true,
    min: 1,
    max: 10,
    validate: Number.isInteger,
  },
  documentationQuality: {
    type: Number,
    required: true,
    min: 1,
    max: 10,
    validate: Number.isInteger,
  },
  ratedAt: { type: Date, required: true },
  ratedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { _id: false });

const ProjectRatingsSchema = new Schema({
  proposal: { type: RatingSnapshotSchema, default: undefined },
  thesis: { type: RatingSnapshotSchema, default: undefined },
}, { _id: false });

const ProjectSchema = new Schema({
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  inviteCode: { type: String, required: true, unique: true },
  
    title: { type: String, default: '' },
  description: { type: String, default: '' },
  titleFingerprint: { type: String, default: '', index: true },
  // Legacy display string retained for backwards compatibility and exports.
  domain: { type: String, default: '' },
  // Canonical multi-select project domain identifiers.
  domains: { type: [String], default: [] },
  tools: { type: String, default: '' },
  pdfUrl: { type: String, default: '' },
  pdfSize: { type: Number, default: 0 }, // <-- NEW: track size of the uploaded PDF
  status: { type: String, default: 'Pending' },
  reviewRemarks: { type: String, default: '' },
  version: { type: Number, default: 0, min: 0 },
  maxTeamSize: { type: Number, enum: [2, 3], default: 2 },
  ratings: { type: ProjectRatingsSchema, default: undefined },
  
  stage: { 
    type: String, 
    enum: ['PROPOSAL', 'THESIS_DRAFT', 'FINAL_DELIVERABLES'], 
    default: 'PROPOSAL' 
  }
}, { timestamps: true });

ProjectSchema.index({ status: 1, updatedAt: -1 });
ProjectSchema.index({ members: 1 });

const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema);
export default Project;
