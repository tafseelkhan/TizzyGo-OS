import mongoose, { Schema, Document } from "mongoose";
import { WebhookEventType } from "../../../enums/PaymentGatewayType";

export interface IWebhookEvent extends Document {
  webhookEventId: string;
  gateway: string;
  gatewayEventId: string;
  eventType: WebhookEventType;
  status: "pending" | "processed" | "failed" | "ignored";
  payload: any;
  processedAt?: Date;
  processingError?: string;
  retryCount: number;
  maxRetries: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookEventSchema: Schema<IWebhookEvent> = new Schema(
  {
    webhookEventId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    gateway: {
      type: String,
      required: true,
      index: true,
    },
    gatewayEventId: {
      type: String,
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: Object.values(WebhookEventType),
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "processed", "failed", "ignored"],
      default: "pending",
      index: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    processedAt: {
      type: Date,
    },
    processingError: {
      type: String,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    maxRetries: {
      type: Number,
      default: 5,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

WebhookEventSchema.index({ gateway: 1, gatewayEventId: 1 }, { unique: true });
WebhookEventSchema.index({ status: 1, createdAt: 1 });

export default mongoose.models.WebhookEvent ||
  mongoose.model<IWebhookEvent>("WebhookEvent", WebhookEventSchema);
