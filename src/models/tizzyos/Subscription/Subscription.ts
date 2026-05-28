import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  plan: {
    type: String,
    enum: ['free', 'basic', 'pro', 'premium'],
    default: 'free',
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  subscribedAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Subscription', subscriptionSchema);
