import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema({
  senderName: { type: String, required: true },
  senderRole: { type: String, required: true }, // 'supervisor' or 'student'
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const ProjectSchema = new mongoose.Schema({
  title: { type: String, default: 'Untitled Project' },
  domain: { type: String },
  pdfUrl: { type: String },
  status: { 
    type: String, 
    default: 'Pending', 
    enum: ['Pending', 'Changes Requested', 'Approved', 'Rejected'] 
  },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  inviteCode: { type: String, required: true, unique: true },
  comments: [CommentSchema]
}, { timestamps: true });

export default mongoose.models.Project || mongoose.model('Project', ProjectSchema);