// models/RateLimit.ts
import mongoose, { Schema } from 'mongoose';

const RateLimitSchema = new Schema({
  // The identifier can be an email address or an IP address
  identifier: { 
    type: String, 
    required: true, 
    unique: true,
    maxlength: 160,
  },
  // Tracks how many requests have been made within the window
  count: { 
    type: Number, 
    default: 1 
  },
  // Fixed-window counters expire after 15 minutes.
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: 900
  }
});

// Prevent Next.js Hot-Reload compilation errors by checking if the model already exists
const RateLimit = mongoose.models.RateLimit || mongoose.model('RateLimit', RateLimitSchema);

export default RateLimit;
