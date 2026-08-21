import mongoose, { Schema, Document } from "mongoose";

export interface ITransaction extends Document {
  transactionId: string;
  transactionType: "payment" | "refund" | "chargeback";
  status: string;
  amount: number;
  currency: string;
  gateway: string;
  gatewayTransactionId?: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  orderId: mongoose.Types.ObjectId;
  orderIds?: mongoose.Types.ObjectId[]; // ✅ NEW: For multiple orders
  orderNumber: string;
  checkoutSessionId?: string;
  userId?: string;
  payerName?: string;
  payerEmail?: string;
  receiverName?: string;
  receiverAccountId?: string;
  metadata?: Record<string, any>;
  rawRequest?: any;
  rawResponse?: any;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema: Schema<ITransaction> = new Schema(
  {
    transactionId: { type: String, unique: true, required: true },
    transactionType: {
      type: String,
      enum: ["payment", "refund", "chargeback"],
      required: true,
    },
    status: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    gateway: { type: String, required: true },
    gatewayTransactionId: { type: String, sparse: true },
    gatewayOrderId: { type: String, sparse: true },
    gatewayPaymentId: { type: String, sparse: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderIds: [{ type: Schema.Types.ObjectId, ref: "Order" }],
    orderNumber: { type: String, required: true },
    checkoutSessionId: { type: String, sparse: true },
    userId: { type: String },
    payerName: { type: String },
    payerEmail: { type: String },
    receiverName: { type: String },
    receiverAccountId: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
    rawRequest: { type: Schema.Types.Mixed },
    rawResponse: { type: Schema.Types.Mixed },
    completedAt: Date,
  },
  { timestamps: true },
);

TransactionSchema.index({ orderId: 1 });
TransactionSchema.index({ orderIds: 1 });
TransactionSchema.index({ userId: 1 });

export default mongoose.models.Transaction ||
  mongoose.model<ITransaction>("Transaction", TransactionSchema);
