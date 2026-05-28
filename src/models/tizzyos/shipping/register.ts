import mongoose, { Schema, Document } from "mongoose";

/* =========================
   TYPES
========================= */

export interface IShipping extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;

  // Vehicle
  vehicleCategory: "Bike" | "Scooter" | "Car" | "Auto" | "Tempo";
  vehicleBrand: string;
  vehicleModel: string;
  vehicleNumber: string;
  vehicleImage: string;

  // 📦 Capacity
  maxOrdersPerDay: number;
  isAvailable: boolean;

  // 📊 Order Tracking (REQUIRED – safe defaults)
  orderStats: {
    assigned: number;
    delivered: number;
    remaining: number;
  };

  // 🟢 Online / Offline
  isOnline: boolean;
  lastOnlineAt?: Date;
  lastOfflineAt?: Date;

  // 🪪 KYC
  kyc: {
    drivingLicenseNumber: string;
    drivingLicenseImage: string;

    identityType?: "Aadhaar" | "VoterID" | "Passport" | "PAN";
    identityNumber?: string;
    identityImage?: string;

    status: "pending" | "verified" | "rejected";
    verifiedAt?: Date;
  };

  // Status
  status: "pending" | "approved" | "decline";

  // Legal
  agreedToTerms: boolean;
  agreedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

/* =========================
   SCHEMA
========================= */

const ShippingSchema = new Schema<IShipping>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    name: { type: String, required: true, trim: true },

    // 🚗 Vehicle
    vehicleCategory: {
      type: String,
      enum: ["Bike", "Scooter", "Car", "Auto", "Tempo"],
      required: true,
    },

    vehicleBrand: { type: String, required: true },
    vehicleModel: { type: String, required: true },

    vehicleNumber: {
      type: String,
      required: true,
      uppercase: true,
    },

    vehicleImage: { type: String, required: true },

    // 📦 Capacity
    maxOrdersPerDay: { type: Number, default: 25 },
    isAvailable: { type: Boolean, default: true },

    // 📊 Order Stats
    orderStats: {
      assigned: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      remaining: { type: Number, default: 0 },
    },

    // 🟢 Online / Offline
    isOnline: { type: Boolean, default: false },
    lastOnlineAt: Date,
    lastOfflineAt: Date,

    // 🪪 KYC
    kyc: {
      drivingLicenseNumber: { type: String, required: true },
      drivingLicenseImage: { type: String, required: true },

      identityType: {
        type: String,
        enum: ["Aadhaar", "VoterID", "Passport", "PAN"],
      },

      identityNumber: String,
      identityImage: String,

      status: {
        type: String,
        enum: ["pending", "verified", "rejected"],
        default: "pending",
      },

      verifiedAt: Date,
    },

    // ✅ Approval
    status: {
      type: String,
      enum: ["pending", "approved", "decline"],
      default: "pending",
    },

    // 📜 Legal
    agreedToTerms: { type: Boolean, required: true },
    agreedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

/* =========================
   INDEXES
========================= */

ShippingSchema.index({ isOnline: 1, isAvailable: 1 });
ShippingSchema.index({ status: 1 });
ShippingSchema.index({ "kyc.status": 1 });

export default mongoose.model<IShipping>(
  "Shipping",
  ShippingSchema,
  "shippingregister"
);
