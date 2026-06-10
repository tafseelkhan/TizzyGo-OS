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

export default mongoose.models.FWSWareHouse ||
  mongoose.model("FWSWareHouse", FWSWareHouseSchema);
