import mongoose, { Document, Schema } from "mongoose";

export interface IRidePayment extends Document {
  rideId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  driverId: mongoose.Types.ObjectId;
  bookingId: string;
  amount: number;
  platformFee: number;
  gstAmount: number;
  commissionAmount: number;
  driverEarning: number;
  method: "COC" | "ONLINE";
  metadata: Map<string, any>;
  status: "Pending" | "Processing" | "Paid" | "Failed" | "Refunded";
  transactionId?: string;
  gateway?: string;
  gatewayPaymentId?: string;
  gatewayOrderId?: string;
  paidAt?: Date;
  refundedAt?: Date;
  paymentCompletedAt?: Date;
  refundCompletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RidePaymentSchema = new Schema<IRidePayment>(
  {
    rideId: {
      type: Schema.Types.ObjectId,
      ref: "RideBooking",
      required: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bookingId: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    platformFee: {
      type: Number,
      default: 0,
      required: true,
    },
    gstAmount: {
      type: Number,
      default: 0,
      required: true,
    },
    commissionAmount: {
      type: Number,
      default: 0,
      required: true,
    },
    driverEarning: {
      type: Number,
      default: 0,
      required: true,
    },
    method: {
      type: String,
      enum: ["COC", "ONLINE"],
      required: true,
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ["Pending", "Processing", "Paid", "Failed", "Refunded"],
      default: "Pending",
      required: true,
    },
    transactionId: {
      type: String,
      required: false,
    },
    gateway: {
      type: String,
      required: false,
    },
    gatewayPaymentId: {
      type: String,
      required: false,
    },
    gatewayOrderId: {
      type: String,
      required: false,
    },
    paidAt: {
      type: Date,
      required: false,
    },
    refundedAt: {
      type: Date,
      required: false,
    },
    paymentCompletedAt: {
      type: Date,
      required: false,
    },
    refundCompletedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

RidePaymentSchema.index({ rideId: 1 }, { unique: true });
RidePaymentSchema.index({ customerId: 1 });
RidePaymentSchema.index({ driverId: 1 });
RidePaymentSchema.index({ status: 1 });
RidePaymentSchema.index({ transactionId: 1 });
RidePaymentSchema.index({ gatewayOrderId: 1 });
RidePaymentSchema.index({ bookingId: 1 });

export default mongoose.model<IRidePayment>("RidePayment", RidePaymentSchema);
