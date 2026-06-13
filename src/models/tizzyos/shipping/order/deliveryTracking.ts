import mongoose from "mongoose";

const TrackingEventSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
      enum: [
        "waiting_for_assignment",
        "delivered_to_fws",
        "verified_at_fws",
        "assignment_sent",
        "assignment_accepted",
        "picked_up",
        "in_transit",
        "out_for_delivery",
        "handover_to_rider",
        "handover_to_truck",
        "handover_to_fws",
        "handover_to_buyer",
      ],
    },
    holderType: {
      type: String,
      enum: ["SELLER", "RIDER", "FWS", "TRUCK", "BUYER"],
      required: true,
    },
    holderId: String,
    holderName: String,
    fwsId: String,
    fwsName: String,
    shippingUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    shippingName: String,
    shippingType: { type: String, enum: ["RIDER", "TRUCK"] },
    fromLocation: { address: String, latitude: Number, longitude: Number },
    toLocation: { address: String, latitude: Number, longitude: Number },
    note: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const PendingAssignmentSchema = new mongoose.Schema(
  {
    assignmentId: { type: String, required: true, unique: true },
    assigneeId: { type: String, required: true },
    assigneeType: { type: String, enum: ["RIDER", "TRUCK"], required: true },
    assignedBy: { type: String, required: true },
    assignedByType: { type: String, enum: ["SELLER", "FWS"], required: true },
    assignedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    assignmentType: { type: String, enum: ["AUTO", "MANUAL"], required: true },
    distance: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["PENDING_ACCEPTANCE", "ACCEPTED", "EXPIRED", "CANCELLED"],
      default: "PENDING_ACCEPTANCE",
    },
  },
  { _id: false },
);

const DeliveryTrackingSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    trackingId: { type: String, unique: true, sparse: true, index: true },
    startLocation: {
      address: String,
      latitude: Number,
      longitude: Number,
      createdAt: { type: Date, default: Date.now },
    },
    destinationLocation: {
      address: String,
      latitude: Number,
      longitude: Number,
    },
    currentHolderType: {
      type: String,
      enum: ["SELLER", "RIDER", "FWS", "TRUCK", "BUYER"],
      default: "SELLER",
    },
    currentHolderId: String,
    currentHolderName: String,
    currentShipping: {
      shippingUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      shippingName: String,
      latitude: Number,
      longitude: Number,
      shippingType: { type: String, enum: ["RIDER", "TRUCK"] },
      updatedAt: { type: Date, default: Date.now },
    },
    currentFWS: {
      fwsId: String,
      fwsName: String,
      address: String,
      latitude: Number,
      longitude: Number,
      updatedAt: { type: Date, default: Date.now },
    },
    route: [
      {
        fwsId: String,
        fwsName: String,
        city: String,
        arrivedAt: { type: Date, default: Date.now },
      },
    ],
    currentAssignment: { type: String, enum: ["RIDER", "TRUCK"] },
    pendingAssignment: { type: PendingAssignmentSchema, default: null },
    currentLocation: {
      address: String,
      latitude: Number,
      longitude: Number,
      updatedAt: { type: Date, default: Date.now },
    },
    currentStatus: {
      type: String,
      enum: [
        "waiting_for_seller",
        "waiting_for_assignment",
        "assignment_sent",
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
    deliveredAt: { type: Date },
    totalFWSVisited: { type: Number, default: 0 },
    totalRidersInvolved: { type: Number, default: 0 },
    totalTrucksInvolved: { type: Number, default: 0 },
    trackingHistory: [TrackingEventSchema],
  },
  { timestamps: true },
);

DeliveryTrackingSchema.index({ trackingId: 1 });
DeliveryTrackingSchema.index({ currentHolderId: 1 });
DeliveryTrackingSchema.index({ currentStatus: 1 });
DeliveryTrackingSchema.index({ "currentFWS.fwsId": 1 });
DeliveryTrackingSchema.index({ "currentShipping.shippingUserId": 1 });
DeliveryTrackingSchema.index({ "pendingAssignment.assignmentId": 1 });
DeliveryTrackingSchema.index({ "pendingAssignment.expiresAt": 1 });

export default mongoose.models.DeliveryTracking ||
  mongoose.model("DeliveryTracking", DeliveryTrackingSchema);
