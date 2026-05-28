import mongoose, { Schema, Document } from 'mongoose';

export interface IorderOtp extends Document {
  orderId: string;
  userId: mongoose.Types.ObjectId;
  otp: string;
  expiresAt: Date;
  createdAt: Date;
}

const orderOtpSchema = new Schema<IorderOtp>(
  {
    orderId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Auto delete expired OTP
orderOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IorderOtp>('orderOtp', orderOtpSchema);
