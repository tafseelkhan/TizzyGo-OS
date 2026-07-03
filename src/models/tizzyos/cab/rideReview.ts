import mongoose, { Document, Schema } from "mongoose";

export interface IRideReview extends Document {
  rideId: mongoose.Types.ObjectId;
  rideCode: string;
  customerId: mongoose.Types.ObjectId;
  driverId: mongoose.Types.ObjectId;
  rating: 1 | 2 | 3 | 4 | 5;
  review?: string;
}

const RideReviewSchema = new Schema<IRideReview>(
  {
    rideId: {
      type: Schema.Types.ObjectId,
      ref: "RideBooking",
      required: true,
      unique: true,
    },
    rideCode: {
      type: String,
      required: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      enum: [1, 2, 3, 4, 5],
      required: true,
    },
    review: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

RideReviewSchema.index({ customerId: 1 });
RideReviewSchema.index({ driverId: 1 });
RideReviewSchema.index({ rating: 1 });
RideReviewSchema.index({ driverId: 1, rating: -1 });
RideReviewSchema.index({ customerId: 1, createdAt: -1 });

export default mongoose.model<IRideReview>("RideReview", RideReviewSchema);
