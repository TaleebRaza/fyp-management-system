import mongoose, { Schema } from 'mongoose';

// --- 1. THE BLUEPRINT (SCHEMA) ---
const UserSchema = new Schema({
  // Basic Info
  name: { type: String, required: true },
  rollNo: { type: String, required: true, unique: true }, 
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'supervisor', 'student'], required: true },
  
  // --- SUPERVISOR ONLY ---
  migrationCode: { type: String, required: false },

  // --- STUDENT ONLY ---
  supervisorId: { type: String, required: false }, 
  status: { type: String, default: 'Pending' },
  projectTitle: { type: String, required: false },
  projectDesc: { type: String, required: false },
  
  // NEW: We must explicitly tell the DB to accept these fields!
  domain: { type: String, required: false },
  tools: { type: String, required: false },
  
  remarks: { type: String, required: false },
  pdfUrl: { type: String, required: false } 
}, { 
  timestamps: true 
});

// --- 2. EXPORT ---
const User = mongoose.models.User || mongoose.model('User', UserSchema);
export default User;