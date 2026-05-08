import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: false, unique: true, sparse: true },
  rollNo: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'supervisor', 'student'], required: true },
  
  program: { type: String, enum: ['BSCS', 'BSAI', 'BSTN', 'BSSE', 'BSCYS', 'BSROB', 'BSDS'], required: false },
  
  batch: { type: String, required: false }, // e.g., "Fall 2026"
  semester: { type: String, default: '7th Semester' }, // Default for new signups

  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, default: 'Unassigned' },
  remarks: { type: String, default: '' },
  projectTitle: { type: String, default: '' },
  pdfUrl: { type: String, default: '' },
  
  migrationCode: { type: String, required: false },
  projectDesc: { type: String, required: false },
  tools: { type: String, required: false },
  notificationsEnabled: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true }, 
  
  resetCode: { type: String, required: false },
  resetCodeExpiry: { type: Date, required: false },
  lastPasswordChange: { type: Date, required: false },
  
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
}, {
  timestamps: true
});

// ==========================================
// ENTERPRISE-GRADE DATABASE INDEXES
// ==========================================

// 1. Single Index on 'role': Speeds up `User.find({ role: 'supervisor' })` significantly.
UserSchema.index({ role: 1 });

// 2. Compound Index: Speeds up our capacity counting `User.countDocuments({ role: 'student', supervisorId: X })`
UserSchema.index({ role: 1, supervisorId: 1 });

// 3. Single Index on Foreign Keys: Speeds up fetching teams `User.find({ projectId: X })`
UserSchema.index({ projectId: 1 });
UserSchema.index({ supervisorId: 1 });

const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default User;