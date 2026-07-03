import mongoose, { Document, Schema } from "mongoose";

export interface IRideRequest extends Document {
  bookingId: string;
  rideId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  driverId: mongoose.Types.ObjectId;
  status: "pending" | "accepted" | "rejected" | "timeout" | "cancelled";
  batchNumber: number;
  distanceFromPickup: number;
  requestedAt: Date;
  respondedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RideRequestSchema = new Schema<IRideRequest>(
  {
    bookingId: {
      type: String,
      required: true,
    },
    rideId: {
      type: Schema.Types.ObjectId,
      ref: "RideBooking",
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
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "timeout", "cancelled"],
      default: "pending",
      required: true,
    },
    batchNumber: {
      type: Number,
      default: 1,
      required: true,
    },
    distanceFromPickup: {
      type: Number,
      required: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    respondedAt: {
      type: Date,
      required: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

RideRequestSchema.index({ bookingId: 1 });
RideRequestSchema.index({ rideId: 1 });
RideRequestSchema.index({ driverId: 1 });
RideRequestSchema.index({ status: 1 });
RideRequestSchema.index({ batchNumber: 1 });
RideRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
RideRequestSchema.index({ rideId: 1, batchNumber: 1 });
RideRequestSchema.index({ driverId: 1, status: 1 });

export default mongoose.model<IRideRequest>("RideRequest", RideRequestSchema);
