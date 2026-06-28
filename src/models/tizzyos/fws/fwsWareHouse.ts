import mongoose, { Schema, Document } from "mongoose";

const FWSWareHouseSchema = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Unique FWS ID
    fwsCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // FWS Udaipur
    name: {
      type: String,
      required: true,
    },

    city: {
      type: String,
      required: true,
    },

    state: {
      type: String,
      required: true,
    },

    pincode: {
      type: String,
    },

    address: {
      type: String,
      required: true,
    },

    latitude: {
      type: Number,
      required: true,
    },

    longitude: {
      type: Number,
      required: true,
    },

    phone: String,
    email: String,

    managerName: String,
    managerPhone: String,

    employee: [
      {
        _id: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
      },
    ],

    // Active / Closed
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },

    // ✅ NEW FIELD: Admin Approval Status
    approvalStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
      default: "PENDING",
      required: true,
    },

    // Admin rejection reason (optional)
    rejectionReason: {
      type: String,
      default: null,
    },

    // Admin approval date
    approvedAt: {
      type: Date,
      default: null,
    },

    // Sorting Hub / Local Hub
    fwsType: {
      type: String,
      enum: ["LOCAL", "REGIONAL", "NATIONAL"],
      default: "LOCAL",
    },

    coverageKm: {
      type: Number,
      default: 50,
    },

    // Capacity
    maxDailyOrders: {
      type: Number,
      default: 0,
    },

    currentOrders: {
      type: Number,
      default: 0,
    },

    isAcceptingOrders: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// ✅ Index for approval status queries
FWSWareHouseSchema.index({ approvalStatus: 1, createdAt: -1 });

// ✅ Compound index for admin dashboard queries
FWSWareHouseSchema.index({ approvalStatus: 1, fwsType: 1 });

export default mongoose.models.FWSWareHouse ||
  mongoose.model("FWSWareHouse", FWSWareHouseSchema);
