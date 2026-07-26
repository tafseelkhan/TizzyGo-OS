// models/rides/RideType.ts
import mongoose, { Document, Schema } from "mongoose";

interface IRideType extends Document {
  name: string;
  code: string;
  description: string;
  vehicleClasses: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const RideTypeSchema = new Schema<IRideType>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    vehicleClasses: {
      type: [String],
      required: true,
      enum: ["Economy", "Standard", "Comfort", "Premium", "Luxury"],
      default: [],
    },
  },
  {
    collection: "ridetypes",
    timestamps: true,
  },
);

// Indexes for faster queries
RideTypeSchema.index({ isActive: 1, sortOrder: 1 });

export default mongoose.model<IRideType>("RideType", RideTypeSchema);
