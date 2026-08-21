// ============================================================
// models/webhook/WebhookEvent.ts
// ============================================================

import mongoose, { Document, Schema } from "mongoose";

export enum WebhookEventStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  RETRYING = "retrying",
  EXPIRED = "expired",
  IGNORED = "ignored",
}

export enum WebhookEventType {
  PAYMENT_AUTHORIZED = "payment.authorized",
  PAYMENT_CAPTURED = "payment.captured",
  PAYMENT_SUCCEEDED = "payment.succeeded",
  PAYMENT_FAILED = "payment.failed",
  PAYMENT_REFUNDED = "payment.refunded",
  PAYMENT_PARTIALLY_REFUNDED = "payment.partially_refunded",
  PAYMENT_CANCELLED = "payment.cancelled",
  SYSTEM_ERROR = "system.error",
}

// Priority order - higher number = more advanced state
export const EVENT_PRIORITY: Record<string, number> = {
  "payment.cancelled": 10,
  "payment.failed": 20,
  "payment.authorized": 30,
  "payment.captured": 40,
  "payment.succeeded": 40,
  "payment.refunded": 50,
  "payment.partially_refunded": 50,
};

// State order for monotonic transitions
export const STATE_ORDER: Record<string, number> = {
  pending: 0,
  authorized: 1,
  failed: 2,
  cancelled: 2,
  completed: 3,
  refunded: 4,
};

export interface IWebhookEvent extends Document {
  // Core identifiers
  idempotencyKey: string; // gatewayEventId - unique per event
  lockKey: string; // Unique per event type (paymentId + eventType)
  paymentLockKey: string; // Payment-level lock (for state machine)

  // Event data
  paymentIntentId: string;
  gatewayEventId: string;
  gatewayOrderId: string;
  eventType: WebhookEventType | string;
  eventPriority: number;

  // Status management
  status: WebhookEventStatus;
  statusHistory: Array<{
    status: WebhookEventStatus;
    timestamp: Date;
    reason?: string;
  }>;

  // Lock management
  lockVersion: number;
  lockedAt?: Date;
  expiresAt?: Date;
  lockedBy?: string;
  lockedInstance?: string;

  // Processing timestamps
  receivedAt: Date;
  processingStartedAt?: Date;
  processingCompletedAt?: Date;
  processingDurationMs?: number;

  // Retry information
  retryCount: number;
  maxRetries: number;
  lastRetryAt?: Date;
  nextRetryAt?: Date;
  retryDelayMs: number;

  // Event payloads
  rawPayload: mongoose.Schema.Types.Mixed;
  normalizedEvent: mongoose.Schema.Types.Mixed;

  // Gateway metadata
  gateway: string;
  signature: string;
  signatureVerified: boolean;

  // Payment metadata
  paymentAmount?: number;
  paymentCurrency?: string;
  paymentMethod?: string;

  // Checkout information
  checkoutSessionId?: string;
  checkoutSessionStatus?: string;

  // Order references
  orderIds: mongoose.Types.ObjectId[];
  orderStatuses?: Record<string, string>;

  // Transaction references
  transactionId?: string;
  transactionStatus?: string;

  // Error information
  errorMessage?: string;
  errorStack?: string;
  errorCode?: string;
  errorCategory?: string;
  isRetryable?: boolean;

  // Metadata
  metadata: mongoose.Schema.Types.Mixed;
  notes: mongoose.Schema.Types.Mixed;

  // Audit
  processedBy?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;

  // Versioning
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

const WebhookEventSchema = new Schema<IWebhookEvent>(
  {
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // ✅ FIXED: lockKey is now paymentId + eventType (unique per event type)
    lockKey: {
      type: String,
      required: true,
      unique: true, // Unique per event type
      index: true,
    },
    paymentLockKey: {
      type: String,
      required: true,
      index: true,
    },

    paymentIntentId: {
      type: String,
      required: true,
      index: true,
    },
    gatewayEventId: {
      type: String,
      required: true,
      index: true,
    },
    gatewayOrderId: {
      type: String,
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: Object.values(WebhookEventType),
      index: true,
    },
    eventPriority: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      required: true,
      enum: Object.values(WebhookEventStatus),
      default: WebhookEventStatus.PENDING,
      index: true,
    },
    statusHistory: [
      {
        status: {
          type: String,
          enum: Object.values(WebhookEventStatus),
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        reason: String,
      },
    ],

    lockVersion: {
      type: Number,
      default: 0,
    },
    lockedAt: Date,
    expiresAt: {
      type: Date,
      index: true,
    },
    lockedBy: String,
    lockedInstance: String,

    receivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    processingStartedAt: Date,
    processingCompletedAt: Date,
    processingDurationMs: Number,

    retryCount: {
      type: Number,
      default: 0,
    },
    maxRetries: {
      type: Number,
      default: 5,
    },
    lastRetryAt: Date,
    nextRetryAt: {
      type: Date,
      index: true,
    },
    retryDelayMs: {
      type: Number,
      default: 1000,
    },

    rawPayload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    normalizedEvent: {
      type: Schema.Types.Mixed,
      required: true,
    },

    gateway: {
      type: String,
      required: true,
      default: "razorpay",
    },
    signature: String,
    signatureVerified: {
      type: Boolean,
      default: false,
    },

    paymentAmount: Number,
    paymentCurrency: String,
    paymentMethod: String,

    checkoutSessionId: {
      type: String,
      sparse: true,
      index: true,
    },
    checkoutSessionStatus: String,

    orderIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
    orderStatuses: Schema.Types.Mixed,

    transactionId: {
      type: String,
      sparse: true,
    },
    transactionStatus: String,

    errorMessage: String,
    errorStack: String,
    errorCode: String,
    errorCategory: String,
    isRetryable: {
      type: Boolean,
      default: false,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    notes: {
      type: Schema.Types.Mixed,
      default: {},
    },

    processedBy: String,
    requestId: String,
    ip: String,
    userAgent: String,

    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
    collection: "webhookevents",
  },
);

// ============================================================
// INDEXES
// ============================================================

// ✅ FIXED: lockKey is now unique (paymentId + eventType)
WebhookEventSchema.index({ lockVersion: 1 });
WebhookEventSchema.index({ receivedAt: -1 });

// TTL for cleanup (30 days)
WebhookEventSchema.index(
  { processingCompletedAt: 1 },
  {
    expireAfterSeconds: 2592000,
    partialFilterExpression: {
      status: {
        $in: [
          WebhookEventStatus.COMPLETED,
          WebhookEventStatus.FAILED,
          WebhookEventStatus.IGNORED,
        ],
      },
    },
  },
);

// ============================================================
// HOOKS
// ============================================================

WebhookEventSchema.pre("save", function (this: IWebhookEvent) {
  if (this.eventType && !this.eventPriority) {
    this.eventPriority = EVENT_PRIORITY[this.eventType as string] || 0;
  }

  // ✅ FIXED: Ensure lockKey is set to paymentId + eventType
  if (!this.lockKey && this.paymentIntentId && this.eventType) {
    this.lockKey = `${this.paymentIntentId}_${this.eventType}`;
  }
});

// ============================================================
// STATIC METHODS
// ============================================================

WebhookEventSchema.statics.findByIdempotencyKey = function (key: string) {
  return this.findOne({ idempotencyKey: key });
};

WebhookEventSchema.statics.findByLockKey = function (key: string) {
  return this.findOne({ lockKey: key });
};

WebhookEventSchema.statics.findStaleLocks = function (
  maxAgeMs: number = 60000,
) {
  const cutoff = new Date(Date.now() - maxAgeMs);
  return this.find({
    status: WebhookEventStatus.PROCESSING,
    $or: [{ expiresAt: { $lt: new Date() } }, { lockedAt: { $lt: cutoff } }],
  });
};

WebhookEventSchema.statics.cleanupExpiredLocks = function () {
  const now = new Date();
  return this.updateMany(
    {
      status: WebhookEventStatus.PROCESSING,
      expiresAt: { $lt: now },
    },
    {
      $set: {
        status: WebhookEventStatus.EXPIRED,
        lockVersion: 0,
        processingCompletedAt: now,
        errorMessage: "Lock expired - cleaned up by maintenance",
        lockedAt: undefined,
        expiresAt: undefined,
        lockedBy: undefined,
        lockedInstance: undefined,
      },
      $push: {
        statusHistory: {
          status: WebhookEventStatus.EXPIRED,
          timestamp: now,
          reason: "Lock expired - cleaned up by maintenance",
        },
      },
    },
  );
};

// ============================================================
// INSTANCE METHODS
// ============================================================

WebhookEventSchema.methods.addStatusHistory = function (
  status: WebhookEventStatus,
  reason?: string,
) {
  this.statusHistory.push({
    status,
    timestamp: new Date(),
    reason,
  });
  return this;
};

WebhookEventSchema.methods.markAsProcessing = function (
  lockedBy: string,
  lockedInstance: string,
  lockTimeoutMs: number = 60000,
) {
  if (
    this.status !== WebhookEventStatus.PENDING &&
    this.status !== WebhookEventStatus.FAILED &&
    this.status !== WebhookEventStatus.EXPIRED
  ) {
    throw new Error(`Cannot transition from ${this.status} to PROCESSING`);
  }

  this.status = WebhookEventStatus.PROCESSING;
  this.processingStartedAt = new Date();
  this.lockVersion = 1;
  this.lockedAt = new Date();
  this.expiresAt = new Date(Date.now() + lockTimeoutMs);
  this.lockedBy = lockedBy;
  this.lockedInstance = lockedInstance;
  this.addStatusHistory(WebhookEventStatus.PROCESSING);
  return this.save();
};

WebhookEventSchema.methods.markAsCompleted = function () {
  if (this.status !== WebhookEventStatus.PROCESSING) {
    throw new Error(`Cannot transition from ${this.status} to COMPLETED`);
  }

  this.status = WebhookEventStatus.COMPLETED;
  this.processingCompletedAt = new Date();
  this.processingDurationMs = this.processingStartedAt
    ? this.processingCompletedAt.getTime() - this.processingStartedAt.getTime()
    : 0;
  this.lockVersion = 0;
  this.lockedAt = undefined;
  this.expiresAt = undefined;
  this.lockedBy = undefined;
  this.lockedInstance = undefined;
  this.addStatusHistory(WebhookEventStatus.COMPLETED);
  return this.save();
};

WebhookEventSchema.methods.markAsFailed = function (
  error: Error,
  isRetryable: boolean = false,
) {
  if (
    this.status !== WebhookEventStatus.PROCESSING &&
    this.status !== WebhookEventStatus.PENDING
  ) {
    throw new Error(`Cannot transition from ${this.status} to FAILED`);
  }

  this.status = WebhookEventStatus.FAILED;
  this.processingCompletedAt = new Date();
  this.processingDurationMs = this.processingStartedAt
    ? this.processingCompletedAt.getTime() - this.processingStartedAt.getTime()
    : 0;
  this.errorMessage = error.message;
  this.errorStack = error.stack;
  this.errorCode = (error as any).code;
  this.errorCategory = (error as any).category || "unknown";
  this.isRetryable = isRetryable;
  this.lockVersion = 0;
  this.lockedAt = undefined;
  this.expiresAt = undefined;
  this.lockedBy = undefined;
  this.lockedInstance = undefined;
  this.addStatusHistory(WebhookEventStatus.FAILED, error.message);
  return this.save();
};

WebhookEventSchema.methods.markAsIgnored = function (reason: string) {
  this.status = WebhookEventStatus.IGNORED;
  this.processingCompletedAt = new Date();
  this.lockVersion = 0;
  this.lockedAt = undefined;
  this.expiresAt = undefined;
  this.lockedBy = undefined;
  this.lockedInstance = undefined;
  this.addStatusHistory(WebhookEventStatus.IGNORED, reason);
  return this.save();
};

// ============================================================
// MODEL
// ============================================================

export let WebhookEvent: mongoose.Model<IWebhookEvent>;

try {
  WebhookEvent = mongoose.model<IWebhookEvent>("WebhookEvent");
} catch {
  WebhookEvent = mongoose.model<IWebhookEvent>(
    "WebhookEvent",
    WebhookEventSchema,
  );
}

export default WebhookEvent;
