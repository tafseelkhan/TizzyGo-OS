import mongoose from "mongoose";

const TrackingEventSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
    },

    holderType: {
      type: String,
      enum: ["SELLER", "RIDER", "FWS", "TRUCK"],
      required: true,
    },

    holderId: String,
    holderName: String,

    fwsId: String,
    fwsName: String,

    truckId: String,
    truckNumber: String,

    riderId: String,
    riderName: String,

    // NEW
    fromLocation: {
      address: String,
      latitude: Number,
      longitude: Number,
    },

    toLocation: {
      address: String,
      latitude: Number,
      longitude: Number,
    },

    note: String,

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const DeliveryTrackingSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // ===================================
    // START LOCATION (Seller)
    // ===================================

    startLocation: {
      address: String,
      latitude: Number,
      longitude: Number,
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },

    // ===================================
    // END LOCATION (Buyer)
    // ===================================

    destinationLocation: {
      address: String,
      latitude: Number,
      longitude: Number,
    },

    // ===================================
    // CURRENT HOLDER
    // ===================================

    currentHolderType: {
      type: String,
      enum: ["SELLER", "RIDER", "FWS", "TRUCK"],
      default: "SELLER",
    },

    currentHolderId: String,

    currentHolderName: String,

    // ===================================
    // CURRENT RIDER
    // ===================================

    currentRider: {
      riderId: String,
      riderName: String,

      latitude: Number,
      longitude: Number,

      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },

    // ===================================
    // CURRENT TRUCK
    // ===================================

    currentTruck: {
      truckId: String,
      truckNumber: String,

      latitude: Number,
      longitude: Number,

      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },

    // ===================================
    // CURRENT WAREHOUSE
    // ===================================

    currentFWS: {
      fwsId: String,
      fwsName: String,

      address: String,

      latitude: Number,
      longitude: Number,

      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },

    // ===================================
    // CURRENT LOCATION
    // ===================================

    currentLocation: {
      address: String,

      latitude: Number,
      longitude: Number,

      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },

    currentStatus: {
      type: String,
      enum: [
        "waiting_for_seller",
        "waiting_for_assignment",
        "assigned",
        "picked_up",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "at_fws",
        "ready_for_dispatch",
      ],
      default: "waiting_for_seller",
    },

    // ===================================
    // DELIVERY SUMMARY
    // ===================================

    totalFWSVisited: {
      type: Number,
      default: 0,
    },

    totalRidersInvolved: {
      type: Number,
      default: 0,
    },

    totalTrucksInvolved: {
      type: Number,
      default: 0,
    },

    // ===================================
    // FULL HISTORY
    // ===================================

    trackingHistory: [TrackingEventSchema],
  },
  {
    timestamps: true,
  },
);

export default mongoose.models.DeliveryTracking ||
  mongoose.model("DeliveryTracking", DeliveryTrackingSchema);
