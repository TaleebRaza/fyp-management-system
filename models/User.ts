import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: false, unique: true, sparse: true },
  rollNo: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'supervisor', 'student'], required: true },
  
  // --- RESTORED REQUIRED FIELDS ---
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, default: 'Unassigned' },
  remarks: { type: String, default: '' },
  projectTitle: { type: String, default: '' },
  pdfUrl: { type: String, default: '' },
  // --------------------------------
  
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

const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default User;