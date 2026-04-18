import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: false, unique: true, sparse: true }, // NEW: Email field
  rollNo: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'supervisor', 'student'], required: true },
  migrationCode: { type: String, required: false },
  supervisorId: { type: String, required: false },
  status: { type: String, default: 'Pending' },
  projectTitle: { type: String, required: false },
  projectDesc: { type: String, required: false },
  domain: { type: String, required: false },
  tools: { type: String, required: false },
  remarks: { type: String, required: false },
  pdfUrl: { type: String, required: false },
  notificationsEnabled: { type: Boolean, default: true } // NEW: Supervisor kill-switch
}, {
  timestamps: true
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default User;