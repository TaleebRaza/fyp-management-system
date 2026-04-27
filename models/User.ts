import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: false, unique: true, sparse: true },
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
  notificationsEnabled: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true }, // NEW: Soft-delete/Ban flag
  // NEW: Password Reset & Security Fields
  resetCode: { type: String, required: false },
  resetCodeExpiry: { type: Date, required: false },
  lastPasswordChange: { type: Date, required: false }
}, {
  timestamps: true
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default User;