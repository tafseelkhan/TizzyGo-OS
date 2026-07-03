import mongoose, { Document, Schema } from "mongoose";

export interface IRideDriverFraud extends Document {
  userId: mongoose.Types.ObjectId;
  totalAcceptedRides: number;
  totalCompletedRides: number;
  totalCancelledRides: number;
  totalRejectedRequests: number;
  totalTimeoutRequests: number;
  cancellationRate: number;
  completionRate: number;
  fraudScore: number;
  warningCount: number;
  isFlagged: boolean;
  isSuspended: boolean;
  suspensionReason: string;
  autoSuspend: boolean;
  fraudLevel: "Low" | "Medium" | "High" | "Critical";
  lastWarningAt?: Date;
  suspendedAt?: Date;
  suspensionEndsAt?: Date;
  lastRideCancelledAt?: Date;
  lastFraudCheckedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RideDriverFraudSchema = new Schema<IRideDriverFraud>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    totalAcceptedRides: {
      type: Number,
      default: 0,
      required: true,
    },
    totalCompletedRides: {
      type: Number,
      default: 0,
      required: true,
    },
    totalCancelledRides: {
      type: Number,
      default: 0,
      required: true,
    },
    totalRejectedRequests: {
      type: Number,
      default: 0,
      required: true,
    },
    totalTimeoutRequests: {
      type: Number,
      default: 0,
      required: true,
    },
    cancellationRate: {
      type: Number,
      default: 0,
      required: true,
    },
    completionRate: {
      type: Number,
      default: 100,
      required: true,
    },
    fraudScore: {
      type: Number,
      default: 0,
      required: true,
    },
    warningCount: {
      type: Number,
      default: 0,
      required: true,
    },
    isFlagged: {
      type: Boolean,
      default: false,
      required: true,
    },
    isSuspended: {
      type: Boolean,
      default: false,
      required: true,
    },
    suspensionReason: {
      type: String,
      default: "",
      required: true,
    },
    autoSuspend: {
      type: Boolean,
      default: true,
      required: true,
    },
    fraudLevel: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Low",
      required: true,
    },
    lastWarningAt: {
      type: Date,
      required: false,
    },
    suspendedAt: {
      type: Date,
      required: false,
    },
    suspensionEndsAt: {
      type: Date,
      required: false,
    },
    lastRideCancelledAt: {
      type: Date,
      required: false,
    },
    lastFraudCheckedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

RideDriverFraudSchema.index({ fraudScore: -1 });
RideDriverFraudSchema.index({ fraudLevel: 1 });
RideDriverFraudSchema.index({ isFlagged: 1 });
RideDriverFraudSchema.index({ isSuspended: 1 });
RideDriverFraudSchema.index({ fraudLevel: 1, isSuspended: 1 });

export default mongoose.model<IRideDriverFraud>(
  "RideDriverFraud",
  RideDriverFraudSchema,
);
