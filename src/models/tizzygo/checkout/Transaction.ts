import mongoose, { Schema, Document } from "mongoose";
import { TransactionType, PaymentStatus } from "../../../enums/PaymentGatewayType";

export interface ITransaction extends Document {
  // Core fields
  transactionId: string;
  transactionType: TransactionType;
  status: PaymentStatus;

  // Amount fields
  amount: number;
  currency: string;
  fees?: number;
  tax?: number;
  netAmount?: number;

  // Gateway fields
  gateway: string;
  gatewayTransactionId?: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  gatewayRefundId?: string;

  // References
  orderId?: mongoose.Types.ObjectId;
  orderNumber?: string;
  checkoutSessionId?: string;
  userId: string;
  parentTransactionId?: mongoose.Types.ObjectId;

  // Customer fields
  payerName?: string;
  payerEmail?: string;
  payerPhone?: string;
  receiverName?: string;
  receiverAccountId?: string;

  // Metadata
  metadata?: Record<string, any>;

  // Raw data
  rawRequest?: any;
  rawResponse?: any;

  // Timestamps
  completedAt?: Date;
  settledAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema: Schema<ITransaction> = new Schema(
  {
    transactionId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: Object.values(TransactionType),
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    fees: {
      type: Number,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    netAmount: {
      type: Number,
    },
    gateway: {
      type: String,
      required: true,
      index: true,
    },
    gatewayTransactionId: {
      type: String,
      index: true,
      sparse: true,
    },
    gatewayOrderId: {
      type: String,
      sparse: true,
    },
    gatewayPaymentId: {
      type: String,
      sparse: true,
    },
    gatewayRefundId: {
      type: String,
      sparse: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      index: true,
      sparse: true,
    },
    orderNumber: {
      type: String,
      index: true,
      sparse: true,
    },
    checkoutSessionId: {
      type: String,
      index: true,
      sparse: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    parentTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      sparse: true,
    },
    payerName: {
      type: String,
    },
    payerEmail: {
      type: String,
    },
    payerPhone: {
      type: String,
    },
    receiverName: {
      type: String,
    },
    receiverAccountId: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    rawRequest: {
      type: Schema.Types.Mixed,
    },
    rawResponse: {
      type: Schema.Types.Mixed,
    },
    completedAt: {
      type: Date,
    },
    settledAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for efficient queries
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ gateway: 1, gatewayTransactionId: 1 });
TransactionSchema.index({ orderId: 1, transactionType: 1 });
TransactionSchema.index({ status: 1, createdAt: 1 });

export default mongoose.models.Transaction ||
  mongoose.model<ITransaction>("Transaction", TransactionSchema);
