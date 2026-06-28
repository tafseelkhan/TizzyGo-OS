// models/tizzyos/shipping/order/deliveryTracking.ts

import mongoose from "mongoose";

// FWS Processing Stages Enum
export enum FWSProcessingStage {
  RECEIVED = "RECEIVED",
  SCANNED = "SCANNED",
  READY_FOR_DISPATCH = "READY_FOR_DISPATCH",
}

// ============================================================
// SCHEMA DEFINITIONS
// ============================================================

// Route History Entry Schema
const RouteHistoryEntrySchema = new mongoose.Schema(
  {
    scanId: {
      type: String,
      required: true,
      unique: false,
      index: true,
    },
    scanFingerprint: {
      // ✅ NEW: Permanent deterministic fingerprint
      type: String,
      required: true,
      unique: false,
      index: true,
    },
    fromHolderId: { type: String, required: true },
    fromHolderType: { type: String, required: true },
    fromHolderName: String,
    toHolderId: { type: String, required: true },
    toHolderType: { type: String, required: true },
    toHolderName: String,
    scannedByUserId: { type: String, required: true },
    scannedByName: String,
    scannedByType: String,
    location: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      address: String,
    },
    transferredAt: { type: Date, default: Date.now },
    scanType: {
      type: String,
      enum: ["HANDOVER", "VERIFICATION", "DISPATCH", "DELIVERY"],
      required: true,
    },
  },
  { _id: false },
);

// QR Ownership History Entry Schema
const QROwnershipEntrySchema = new mongoose.Schema(
  {
    holderId: { type: String, required: true },
    holderType: {
      type: String,
      enum: ["SELLER", "RIDER", "FWS", "TRUCK", "BUYER"],
      required: true,
    },
    holderName: String,
    receivedAt: { type: Date, required: true, default: Date.now },
    releasedAt: { type: Date, default: null },
  },
  { _id: false },
);

// Tracking Event Schema
const TrackingEventSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
      enum: [
        "waiting_for_assignment",
        "created",
        "in_transit_to_fws",
        "received_at_fws",
        "scanned_at_fws",
        "ready_for_dispatch",
        "assignment_sent",
        "assignment_accepted",
        "picked_up",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "qr_scanned",
        "qr_released",
      ],
    },
    holderType: {
      type: String,
      enum: ["SELLER", "RIDER", "FWS", "TRUCK", "BUYER"],
      required: true,
    },
    holderId: { type: String, required: true },
    holderName: String,
    note: String,
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
    scanInfo: {
      scannedByUserId: String,
      scannedByName: String,
      scannedByType: String,
      scannedAt: { type: Date, default: Date.now },
      scanType: {
        type: String,
        enum: ["HANDOVER", "VERIFICATION", "DISPATCH", "DELIVERY"],
      },
    },
    fwsProcessingStage: {
      type: String,
      enum: Object.values(FWSProcessingStage),
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// FWS Current Schema
const FWSCurrentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    fwsCode: { type: String, required: true },
    fwsName: { type: String, required: true },
    city: String,
    address: String,
    latitude: Number,
    longitude: Number,
    processingStage: {
      type: String,
      enum: Object.values(FWSProcessingStage),
      default: FWSProcessingStage.RECEIVED,
    },
    scannedByType: String,
    scannedByUserId: String,
    scannedAt: Date,
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// ============================================================
// ✅ NEW: Assignment History Schema (NEVER DELETE)
// ============================================================

const AssignmentHistorySchema = new mongoose.Schema(
  {
    assignmentId: { type: String, required: true },
    assigneeId: { type: String, required: true },
    assigneeType: {
      type: String,
      enum: ["RIDER", "TRUCK"],
      required: true,
    },
    assignedBy: { type: String, required: true },
    assignedByType: {
      type: String,
      enum: ["SELLER", "FWS"],
      required: true,
    },
    assignedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date },
    rejectedAt: { type: Date },
    cancelledAt: { type: Date },
    completedAt: { type: Date },
    assignmentType: {
      type: String,
      enum: ["AUTO", "MANUAL"],
      required: true,
    },
    distance: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["PENDING_ACCEPTANCE", "ACCEPTED", "REJECTED", "CANCELLED"],
      default: "PENDING_ACCEPTANCE",
    },
    metadata: {
      orderId: String,
      trackingId: String,
      source: String,
      note: String,
    },
  },
  { _id: false },
);

// ============================================================
// ✅ UPDATED: Pending Assignment Schema (with more statuses)
// ============================================================

const PendingAssignmentSchema = new mongoose.Schema(
  {
    assignmentId: { type: String, required: true },
    assigneeId: { type: String, required: true },
    assigneeType: {
      type: String,
      enum: ["RIDER", "TRUCK"],
      required: true,
    },
    assignedBy: { type: String, required: true },
    assignedByType: {
      type: String,
      enum: ["SELLER", "FWS"],
      required: true,
    },
    assignedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    assignmentType: {
      type: String,
      enum: ["AUTO", "MANUAL"],
      required: true,
    },
    distance: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["PENDING_ACCEPTANCE", "ACCEPTED", "REJECTED", "CANCELLED"],
      default: "PENDING_ACCEPTANCE",
    },
    acceptedAt: { type: Date },
    rejectedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { _id: false },
);

// ============================================================
// MAIN DELIVERY TRACKING SCHEMA
// ============================================================

const DeliveryTrackingSchema = new mongoose.Schema(
  {
    // ============================================================
    // IDENTIFIERS
    // ============================================================
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    trackingId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    // ============================================================
    // CURRENT HOLDER (always userId, never employeeId)
    // ============================================================
    currentHolderType: {
      type: String,
      enum: ["SELLER", "RIDER", "FWS", "TRUCK", "BUYER"],
      required: true,
    },
    currentHolderId: { type: String, required: true },
    currentHolderName: String,

    // ============================================================
    // CURRENT FWS (warehouse ownership)
    // ============================================================
    currentFWS: {
      type: FWSCurrentSchema,
      default: null,
    },

    // ============================================================
    // CURRENT SHIPPING PARTNER
    // ============================================================
    currentShipping: {
      shippingUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      shippingName: String,
      latitude: Number,
      longitude: Number,
      shippingType: {
        type: String,
        enum: ["RIDER", "TRUCK"],
      },
      updatedAt: { type: Date, default: Date.now },
    },

    // ============================================================
    // COMPLETE ROUTE HISTORY (with scanId for duplicate detection)
    // ============================================================
    routeHistory: [RouteHistoryEntrySchema],

    // ============================================================
    // QR OWNERSHIP HISTORY (releasedAt must be null for active)
    // ============================================================
    qrOwnershipHistory: [QROwnershipEntrySchema],

    // ============================================================
    // ✅ NEW: ASSIGNMENT HISTORY (NEVER DELETE - Audit Trail)
    // ============================================================
    assignmentHistory: [AssignmentHistorySchema],

    // ============================================================
    // CURRENT PENDING ASSIGNMENT (preserved, never deleted)
    // ============================================================
    pendingAssignment: {
      type: PendingAssignmentSchema,
      default: null,
    },

    // ============================================================
    // CURRENT LOCATION
    // ============================================================
    currentLocation: {
      address: String,
      latitude: Number,
      longitude: Number,
      updatedAt: { type: Date, default: Date.now },
    },

    // ============================================================
    // STATUS
    // ============================================================
    currentStatus: {
      type: String,
      enum: [
        "waiting_for_assignment",
        "created",
        "in_transit_to_fws",
        "received_at_fws",
        "scanned_at_fws",
        "ready_for_dispatch",
        "assignment_sent",
        "assignment_accepted",
        "picked_up",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      default: "created",
    },

    deliveredAt: { type: Date },

    // ============================================================
    // STATISTICS
    // ============================================================
    totalFWSVisited: { type: Number, default: 0 },
    totalRidersInvolved: { type: Number, default: 0 },
    totalTrucksInvolved: { type: Number, default: 0 },

    // ============================================================
    // COMPLETE TRACKING HISTORY
    // ============================================================
    trackingHistory: [TrackingEventSchema],

    // ============================================================
    // METADATA
    // ============================================================
    startLocation: {
      address: String,
      latitude: Number,
      longitude: Number,
    },
    destinationLocation: {
      address: String,
      latitude: Number,
      longitude: Number,
    },
    fulfillmentType: {
      type: String,
      enum: ["SELLER", "FWS"],
    },
  },
  {
    timestamps: true,
    versionKey: "__v",
  },
);

// ============================================================
// INDEXES
// ============================================================

// Primary indexes
DeliveryTrackingSchema.index({ trackingId: 1 });
DeliveryTrackingSchema.index({ currentHolderId: 1 });
DeliveryTrackingSchema.index({ currentStatus: 1 });

// FWS indexes
DeliveryTrackingSchema.index({ "currentFWS.userId": 1 });
DeliveryTrackingSchema.index({ "currentFWS.fwsCode": 1 });

// Shipping indexes
DeliveryTrackingSchema.index({ "currentShipping.shippingUserId": 1 });

// Assignment indexes
DeliveryTrackingSchema.index({ "pendingAssignment.assignmentId": 1 });
DeliveryTrackingSchema.index({ "pendingAssignment.assigneeId": 1 });
DeliveryTrackingSchema.index({ "pendingAssignment.status": 1 });

// ✅ NEW: Assignment History indexes for audit
DeliveryTrackingSchema.index({ "assignmentHistory.assignmentId": 1 });
DeliveryTrackingSchema.index({ "assignmentHistory.assigneeId": 1 });
DeliveryTrackingSchema.index({ "assignmentHistory.status": 1 });
DeliveryTrackingSchema.index({ "assignmentHistory.assignedAt": -1 });

// QR Ownership indexes
DeliveryTrackingSchema.index({ "qrOwnershipHistory.holderId": 1 });
DeliveryTrackingSchema.index({ "qrOwnershipHistory.releasedAt": 1 });

// ✅ NEW: Route History scanId index for duplicate detection
DeliveryTrackingSchema.index({ "routeHistory.scanId": 1 });

// Route History time indexes
DeliveryTrackingSchema.index({ "routeHistory.transferredAt": -1 });
DeliveryTrackingSchema.index({ "routeHistory.scanFingerprint": 1 });

// Compound indexes
DeliveryTrackingSchema.index({
  orderId: 1,
  currentHolderId: 1,
  currentStatus: 1,
});

// ============================================================
// MODEL EXPORT
// ============================================================

export default mongoose.models.DeliveryTracking ||
  mongoose.model("DeliveryTracking", DeliveryTrackingSchema);
