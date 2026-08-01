import mongoose, { Schema } from 'mongoose';
import { normalizeRollNo } from '../lib/rollNo';
import { normalizeExtraSupervisorSlots } from '../lib/supervisorSlots';

const UserSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: false, unique: true, sparse: true, trim: true, lowercase: true, maxlength: 254 },
  rollNo: { type: String, required: true, unique: true, set: normalizeRollNo, maxlength: 40 },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'supervisor', 'student'], required: true },
  
  program: { type: String, enum: ['BSCS', 'BSAI', 'BSTN', 'BSSE', 'BSCYS', 'BSROB', 'BSDS'], required: false },
  
  batch: { type: String, required: false }, // e.g., "Fall 2026"
  semester: { type: String, default: '7th Semester' }, // Default for new signups

  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, default: 'Unassigned' },
  remarks: { type: String, default: '' },
  projectTitle: { type: String, default: '' },
  pdfUrl: { type: String, default: '' },
  
  migrationCode: { type: String, required: false, trim: true, maxlength: 32, select: false },
  projectDesc: { type: String, required: false },
  // Legacy display string retained while existing routes and exports are upgraded.
  domain: { type: String, default: '' },
  // Canonical multi-select project domain identifiers shared by the whole team.
  domains: { type: [String], default: [] },
  tools: { type: String, required: false },
  notificationsEnabled: { type: Boolean, default: true },
  extraSlots: {
    type: Number,
    default: 0,
    min: 0,
    max: 10,
    set: normalizeExtraSupervisorSlots,
  },
  // Written only after the explicit capacity reconciliation/backfill has verified it.
  occupiedSlots: { type: Number, default: 0, min: 0 },
  isActive: { type: Boolean, default: true }, 
  
  monthlyLoginCount: { type: Number, default: 0 },
  lastLoginMonth: { type: String, default: '' },
  
  resetCode: { type: String, required: false, select: false },
  resetCodeExpiry: { type: Date, required: false, select: false },
  lastPasswordChange: { type: Date, required: false },
  lastNameChangeAt: { type: Date, required: false },

  // Limits student Program/Batch self-editing to once per 24 hours.
  lastProgramBatchChangeAt: { type: Date, required: false },

    // Final automatic date-based assessment. Calculated only once at registration.
  lateRegistrationDays: { type: Number, default: 0, min: 0 },
  lateRegistrationFine: { type: Number, default: 0, min: 0 },
  lateRegistrationFineStatus: {
    type: String,
    enum: ['pending', 'resolved', 'waived'],
    default: 'pending',
  },
  lateRegistrationFineResolvedAt: { type: Date, default: null },

  // Snapshot of the admin-controlled punishment active when this student registered.
  // This is intentionally separate from the automatic late-registration fine above.
  registrationPunishment: {
    active: { type: Boolean, default: false },
    category: { type: String, enum: ['fine', 'other'], default: null },
    title: { type: String, trim: true, maxlength: 120, default: '' },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    amount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['pending', 'resolved', 'waived'], default: 'pending' },
    policyVersion: { type: Number, default: 0, min: 0 },
    imposedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
  },
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
