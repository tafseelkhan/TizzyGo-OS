import mongoose, { Document, Schema } from "mongoose";

export interface IRideDriverFraudLog extends Document {
  bookingId: string;
  userId: mongoose.Types.ObjectId;
  rideId: mongoose.Types.ObjectId;
  rideCode: string;
  action: "accepted" | "completed" | "cancelled" | "rejected" | "timeout";
  fraudScoreChange: number;
  reason: string;
  createdAt: Date;
  updatedAt: Date;
}

const RideDriverFraudLogSchema = new Schema<IRideDriverFraudLog>(
  {
    bookingId: {
      type: String,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rideId: {
      type: Schema.Types.ObjectId,
      ref: "RideBooking",
      required: true,
    },
    rideCode: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: ["accepted", "completed", "cancelled", "rejected", "timeout"],
      required: true,
    },
    fraudScoreChange: {
      type: Number,
      default: 0,
      required: true,
    },
    reason: {
      type: String,
      default: "",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

RideDriverFraudLogSchema.index({ bookingId: 1 });
RideDriverFraudLogSchema.index({ userId: 1, createdAt: -1 });
RideDriverFraudLogSchema.index({ rideId: 1 });
RideDriverFraudLogSchema.index({ action: 1 });
RideDriverFraudLogSchema.index({ createdAt: -1 });
RideDriverFraudLogSchema.index({ userId: 1, action: 1, createdAt: -1 });

export default mongoose.model<IRideDriverFraudLog>(
  "RideDriverFraudLog",
  RideDriverFraudLogSchema,
);
