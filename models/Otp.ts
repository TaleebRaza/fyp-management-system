// models/Otp.ts
import mongoose, { Schema } from 'mongoose';

const OtpSchema = new Schema({
  email: { type: String, required: true, unique: true },
  code: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 900 } // Native MongoDB TTL index expires document after 900 seconds (15 mins)
});

const Otp = mongoose.models.Otp || mongoose.model('Otp', OtpSchema);

export default Otp;