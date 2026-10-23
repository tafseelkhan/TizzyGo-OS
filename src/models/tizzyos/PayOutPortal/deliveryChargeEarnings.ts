// models/tizzyos/PayOutPortal/deliveryChargeEarnings.ts

import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

// ============================================================
// DELIVERY PARTNER TYPE
// ============================================================

export type DeliveryPartnerType =
  | "RIDER"
  | "TRUCKER";

// ============================================================
// DELIVERY EARNING STATUS
// ============================================================

export type DeliveryEarningStatus =
  | "HOLDING"
  | "PAYOUT_AVAILABLE"
  | "WALLET_AVAILABLE"
  | "WITHDRAWAL_PENDING"
  | "PAID"
  | "REFUNDED"
  | "CANCELLED";

// ============================================================
// INTERFACE
// ============================================================

export interface IDeliveryChargeEarning
  extends Document {
  // ==========================================================
  // DELIVERY PARTNER
  // ==========================================================

  deliveryPartnerId: mongoose.Types.ObjectId;

  partnerType: DeliveryPartnerType;

  // ==========================================================
  // TIZZYGO UNIQUE EARNING / BUSINESS ID
  //
  // Example:
  // dcpp_aB3kL9mZpQxY7TnRw2K
  //
  // IMPORTANT:
  // This is NOT Razorpay's payout ID.
  // ==========================================================

  payoutId: string;

  // ==========================================================
  // ACTUAL RAZORPAYX PAYOUT ID
  //
  // Example:
  // pout_xxxxxxxxxxxxx
  //
  // This is populated only when an actual RazorpayX payout
  // is created.
  // ==========================================================

  razorpayPayoutId?: string;

  // ==========================================================
  // ORDER REFERENCES
  // ==========================================================

  orderId: mongoose.Types.ObjectId;

  transactionId?: mongoose.Types.ObjectId;

  // Human-readable TizzyGo order number
  orderNumber?: string;

  // ==========================================================
  // AMOUNTS
  // ==========================================================

  // Original order gross/final amount used for earning context
  grossAmount: number;

  // Total delivery charge paid for the order
  deliveryCharge: number;

  // Final earning belonging to this particular
  // Rider/Trucker.
  //
  // IMPORTANT:
  // This can be a share of deliveryCharge when multiple
  // delivery partners are involved.
  deliveryEarning: number;

  // ==========================================================
  // EARNING LIFECYCLE
  // ==========================================================

  status: DeliveryEarningStatus;

  // ==========================================================
  // SETTLEMENT TIMING
  // ==========================================================

  capturedAt: Date;

  holdUntil: Date;

  payoutAvailableAt: Date;

  walletAvailableAt: Date;

  // ==========================================================
  // WITHDRAWAL
  // ==========================================================

  withdrawalId?: string;

  // ==========================================================
  // FINAL / TERMINAL DATES
  // ==========================================================

  paidAt?: Date;

  refundedAt?: Date;

  cancelledAt?: Date;

  // timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// SCHEMA
// ============================================================

const DeliveryChargeEarningSchema =
  new Schema<IDeliveryChargeEarning>(
    {
      // ======================================================
      // DELIVERY PARTNER ID
      // ======================================================

      deliveryPartnerId: {
        type: Schema.Types.ObjectId,
        required: true,
        index: true,
      },

      // ======================================================
      // RIDER / TRUCKER
      // ======================================================

      partnerType: {
        type: String,
        enum: ["RIDER", "TRUCKER"],
        required: true,
        index: true,
      },

      // ======================================================
      // TIZZYGO UNIQUE PAYOUT / EARNING ID
      //
      // Example:
      // dcpp_aB3kL9mZpQxY7TnRw2K
      // ======================================================

      payoutId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
      },

      // ======================================================
      // ACTUAL RAZORPAYX PAYOUT ID
      //
      // Example:
      // pout_xxxxxxxxxxxxx
      //
      // NEVER store Razorpay payout.id inside payoutId.
      // ======================================================

      razorpayPayoutId: {
        type: String,
        sparse: true,
        index: true,
        trim: true,
      },

      // ======================================================
      // ORDER ID
      //
      // IMPORTANT:
      // NOT UNIQUE.
      //
      // One order can have multiple delivery partners.
      // ======================================================

      orderId: {
        type: Schema.Types.ObjectId,
        ref: "Order",
        required: true,
        index: true,
      },

      // ======================================================
      // TRANSACTION
      // ======================================================

      transactionId: {
        type: Schema.Types.ObjectId,
        ref: "Transaction",
        sparse: true,
        index: true,
      },

      // ======================================================
      // ORDER NUMBER
      // ======================================================

      orderNumber: {
        type: String,
        default: null,
        index: true,
        trim: true,
      },

      // ======================================================
      // GROSS ORDER AMOUNT
      // ======================================================

      grossAmount: {
        type: Number,
        required: true,
        min: 0,
      },

      // ======================================================
      // TOTAL DELIVERY CHARGE
      // ======================================================

      deliveryCharge: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },

      // ======================================================
      // THIS PARTNER'S DELIVERY EARNING
      // ======================================================

      deliveryEarning: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },

      // ======================================================
      // STATUS
      // ======================================================

      status: {
        type: String,
        enum: [
          "HOLDING",
          "PAYOUT_AVAILABLE",
          "WALLET_AVAILABLE",
          "WITHDRAWAL_PENDING",
          "PAID",
          "REFUNDED",
          "CANCELLED",
        ],
        default: "HOLDING",
        required: true,
        index: true,
      },

      // ======================================================
      // CAPTURE / SETTLEMENT TIMING
      // ======================================================

      capturedAt: {
        type: Date,
        required: true,
        index: true,
      },

      holdUntil: {
        type: Date,
        required: true,
        index: true,
      },

      payoutAvailableAt: {
        type: Date,
        required: true,
        index: true,
      },

      walletAvailableAt: {
        type: Date,
        required: true,
        index: true,
      },

      // ======================================================
      // WITHDRAWAL ID
      // ======================================================

      withdrawalId: {
        type: String,
        sparse: true,
        index: true,
        trim: true,
      },

      // ======================================================
      // STATUS DATES
      // ======================================================

      paidAt: {
        type: Date,
      },

      refundedAt: {
        type: Date,
      },

      cancelledAt: {
        type: Date,
      },
    },
    {
      timestamps: true,
      collection: "delivery_charge_earnings",
    },
  );

// ============================================================
// INDEXES
// ============================================================

// Partner wallet/status queries
DeliveryChargeEarningSchema.index({
  deliveryPartnerId: 1,
  status: 1,
});

// Scheduler:
// HOLDING / WALLET availability checks
DeliveryChargeEarningSchema.index({
  status: 1,
  walletAvailableAt: 1,
});

// RazorpayX webhook / payout lookup
DeliveryChargeEarningSchema.index({
  deliveryPartnerId: 1,
  razorpayPayoutId: 1,
  status: 1,
});

// Withdrawal grouping
DeliveryChargeEarningSchema.index({
  deliveryPartnerId: 1,
  withdrawalId: 1,
  status: 1,
});

// ============================================================
// PREVENT DUPLICATE EARNING FOR THE SAME PARTNER + ORDER
//
// One partner can have only one final delivery earning record
// for one order.
//
// Multiple partners can still have earnings for the same order.
//
// Example:
//
// Order A + Rider A   ✅
// Order A + Trucker A ✅
// Order A + Rider B   ✅
//
// But:
//
// Order A + Rider A   ❌ duplicate
// ============================================================

DeliveryChargeEarningSchema.index(
  {
    orderId: 1,
    deliveryPartnerId: 1,
  },
  {
    unique: true,
  },
);

// ============================================================
// MODEL
// ============================================================

const DeliveryChargeEarningModel: Model<IDeliveryChargeEarning> =
  mongoose.models.DeliveryChargeEarning ||
  mongoose.model<IDeliveryChargeEarning>(
    "DeliveryChargeEarning",
    DeliveryChargeEarningSchema,
  );

export default DeliveryChargeEarningModel;
