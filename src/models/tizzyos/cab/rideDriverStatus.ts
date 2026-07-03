import mongoose, { Document, Schema } from "mongoose";

export interface IRideDriverStatus extends Document {
  userId: mongoose.Types.ObjectId;
  isOnline: boolean;
  isAvailable: boolean;
  socketId: string;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RideDriverStatusSchema = new Schema<IRideDriverStatus>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isOnline: {
      type: Boolean,
      required: true,
      default: false,
    },
    isAvailable: {
      type: Boolean,
      required: true,
      default: false,
    },
    socketId: {
      type: String,
      required: true,
      default: "",
    },
    lastSeen: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

RideDriverStatusSchema.index({ userId: 1 }, { unique: true });
RideDriverStatusSchema.index({ isOnline: 1, isAvailable: 1 });
RideDriverStatusSchema.index({ lastSeen: -1 });

export default mongoose.model<IRideDriverStatus>(
  "RideDriverStatus",
  RideDriverStatusSchema,
);
