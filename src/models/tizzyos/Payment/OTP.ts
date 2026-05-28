import mongoose from 'mongoose';

const OTPSchema = new mongoose.Schema({
  contact: {
    type: String,
    required: true,
    unique: true, // Only one OTP per contact
  },
  otp: {
    type: Number,
    required: true,
  },
  expiry: {
    type: Number, // Store as timestamp (Date.now() + 5 mins)
    required: true,
  },
}, {
  timestamps: true, // adds createdAt and updatedAt
});

export default mongoose.models.OTP || mongoose.model('OTP', OTPSchema);
