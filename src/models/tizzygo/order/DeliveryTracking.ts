import mongoose from 'mongoose';

const DeliveryTrackingSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    riderLocation: {
      latitude: Number,
      longitude: Number,
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('DeliveryTracking', DeliveryTrackingSchema);
