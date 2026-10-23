// models/tizzyos/PayOutPortal/sellerEarnings.ts

import mongoose, {
  Schema,
  Document,
} from "mongoose";

export type SellerEarningStatus =
  | "HOLDING"
  | "PAYOUT_AVAILABLE"
  | "WALLET_AVAILABLE"
  | "WITHDRAWAL_PENDING"
  | "PAID"
  | "REFUNDED"
  | "CANCELLED";

export interface ISellerEarning
  extends Document {
  sellerId: mongoose.Types.ObjectId;

  // TizzyGo unique earning/payout reference
  // Example: spp_aB3kL9mZpQxY7TnRw2K
  payoutId: string;

  // Actual RazorpayX payout ID
  razorpayPayoutId?: string;

  orderId: mongoose.Types.ObjectId;
  transactionId?: mongoose.Types.ObjectId;

  orderNumber: string;

  grossAmount: number;
  sellerEarning: number;

  status: SellerEarningStatus;

  capturedAt: Date;
  holdUntil: Date;
  payoutAvailableAt: Date;
  walletAvailableAt: Date;

  withdrawalId?: string;

  paidAt?: Date;
  refundedAt?: Date;
  cancelledAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const SellerEarningSchema: Schema<ISellerEarning> =
  new Schema(
    {
      sellerId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      // ======================================================
      // TIZZYGO UNIQUE EARNING ID
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
      // ======================================================

      razorpayPayoutId: {
        type: String,
        sparse: true,
        index: true,
        trim: true,
      },

      orderId: {
        type: Schema.Types.ObjectId,
        ref: "Order",
        required: true,
        unique: true,
        index: true,
      },

      transactionId: {
        type: Schema.Types.ObjectId,
        ref: "Transaction",
        sparse: true,
        index: true,
      },

      orderNumber: {
        type: String,
        required: true,
        index: true,
      },

      grossAmount: {
        type: Number,
        required: true,
        min: 0,
      },

      sellerEarning: {
        type: Number,
        required: true,
        min: 0,
      },

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

      withdrawalId: {
        type: String,
        sparse: true,
        index: true,
      },

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
    },
  );

SellerEarningSchema.index({
  status: 1,
  holdUntil: 1,
});

SellerEarningSchema.index({
  status: 1,
  walletAvailableAt: 1,
});

SellerEarningSchema.index({
  sellerId: 1,
  status: 1,
  createdAt: -1,
});

SellerEarningSchema.index({
  sellerId: 1,
  razorpayPayoutId: 1,
  status: 1,
});

SellerEarningSchema.index({
  sellerId: 1,
  withdrawalId: 1,
  status: 1,
});

export default
  mongoose.models.SellerEarning ||
  mongoose.model<ISellerEarning>(
    "SellerEarning",
    SellerEarningSchema,
  );