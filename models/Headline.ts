import mongoose, { Schema } from 'mongoose';

const HeadlineSchema = new Schema({
  text: { type: String, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Headline = mongoose.models.Headline || mongoose.model('Headline', HeadlineSchema);

export default Headline;