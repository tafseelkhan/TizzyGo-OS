// models/tizzyos/fws/fwsEmployeeActivity.ts

import mongoose from "mongoose";

export enum FWSEmployeeActivityType {
  RECEIVED_AT_FWS = "RECEIVED_AT_FWS",
  VERIFIED_AT_FWS = "VERIFIED_AT_FWS",
  READY_FOR_DISPATCH = "READY_FOR_DISPATCH",
  ASSIGNED_SHIPPING = "ASSIGNED_SHIPPING",
}

const FWSEmployeeActivitySchema = new mongoose.Schema(
  {
    employeeUserId: {
      type: String,
      required: true,
      index: true,
    },
    employeeName: {
      type: String,
      required: true,
    },
    fwsUserId: {
      type: String,
      required: true,
      index: true,
    },
    fwsCode: {
      type: String,
      required: true,
    },
    activityType: {
      type: String,
      enum: Object.values(FWSEmployeeActivityType),
      required: true,
      index: true,
    },
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    trackingId: {
      type: String,
      required: true,
      index: true,
    },
    activityDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for statistics queries
FWSEmployeeActivitySchema.index({ employeeUserId: 1, activityDate: 1 });
FWSEmployeeActivitySchema.index({ employeeUserId: 1, activityType: 1 });
FWSEmployeeActivitySchema.index({ fwsUserId: 1, activityDate: 1 });
FWSEmployeeActivitySchema.index({
  employeeUserId: 1,
  activityType: 1,
  activityDate: 1,
});

export default mongoose.models.FWSEmployeeActivity ||
  mongoose.model("FWSEmployeeActivity", FWSEmployeeActivitySchema);
