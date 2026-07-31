import mongoose, { Schema } from 'mongoose';

const RollNumberClaimSchema = new Schema(
  {
    // The normalized roll number is the document ID, so MongoDB's built-in
    // unique _id index becomes the concurrency-safe registration lock.
    _id: { type: String, required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    collection: 'roll_number_claims',
    timestamps: true,
    versionKey: false,
  }
);

const RollNumberClaim =
  mongoose.models.RollNumberClaim || mongoose.model('RollNumberClaim', RollNumberClaimSchema);

export default RollNumberClaim;
