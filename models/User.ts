import mongoose, { Schema } from 'mongoose';
import { normalizeRollNo } from '../lib/rollNo';

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: false, unique: true, sparse: true },
  rollNo: { type: String, required: true, unique: true, set: normalizeRollNo },
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
  
  monthlyLoginCount: { type: Number, default: 0 },
  lastLoginMonth: { type: String, default: '' },
  
  resetCode: { type: String, required: false },
  resetCodeExpiry: { type: Date, required: false },
  lastPasswordChange: { type: Date, required: false },

  // Limits student Program/Batch self-editing to once per 24 hours.
  lastProgramBatchChangeAt: { type: Date, required: false },
  
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },

  // --- NEW: Supervisor Broadcast Fields ---
  broadcastType: { type: String, enum: ['text', 'audio', null], default: null },
  broadcastContent: { type: String, default: null },
  broadcastSize: { type: Number, default: 0 },
  broadcastCreatedAt: { type: Date, default: null },
}, {
  timestamps: true
});

// ==========================================
// DATABASE INDEXES
// ==========================================

// Speeds up role-based reads such as supervisor lists and student lists.
UserSchema.index({ role: 1 });

// Speeds up supervisor capacity checks and student lookups by supervisor.
UserSchema.index({ role: 1, supervisorId: 1 });

// Speeds up fetching project members and supervisor/team references.
UserSchema.index({ projectId: 1 });
UserSchema.index({ supervisorId: 1 });

// Speeds up the default admin student list: newest students first.
UserSchema.index({ role: 1, createdAt: -1 });

// Speeds up admin student filters when filtering by program, batch, and status together.
UserSchema.index({ role: 1, program: 1, batch: 1, status: 1, createdAt: -1 });

// Speeds up common single-filter admin views without forcing MongoDB to scan all students.
UserSchema.index({ role: 1, program: 1, createdAt: -1 });
UserSchema.index({ role: 1, batch: 1, createdAt: -1 });
UserSchema.index({ role: 1, status: 1, createdAt: -1 });

const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default User;