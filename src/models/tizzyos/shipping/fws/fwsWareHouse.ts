import mongoose from "mongoose";

const FWSWareHouseSchema = new mongoose.Schema(
  {
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

    employees: [
      {
        userId: String,
        name: String,
        role: {
          type: String,
          enum: ["MANAGER", "SUPERVISOR", "SCANNER", "PACKER", "DISPATCHER"],
        },
      },
    ],

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

    // Active / Closed
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
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

// ✅ Added index for fast employee lookup
FWSWareHouseSchema.index({ "employees.userId": 1 });

export default mongoose.models.FWSWareHouse ||
  mongoose.model("FWSWareHouse", FWSWareHouseSchema);
