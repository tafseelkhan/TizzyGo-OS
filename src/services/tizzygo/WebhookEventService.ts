// ============================================================
// services/webhook/WebhookEventService.ts
// ============================================================

import mongoose from "mongoose";
import crypto from "crypto";
import WebhookEvent, {
  IWebhookEvent,
  WebhookEventStatus,
  WebhookEventType,
  EVENT_PRIORITY,
} from "../../models/tizzygo/checkout/WebhookEvent";
import { logger } from "../../utils/tizzygo/logger";

export interface LockResult {
  success: boolean;
  event?: IWebhookEvent;
  status?: WebhookEventStatus;
  error?: string;
  errorCategory?: string;
  lockAcquired?: boolean;
}

export interface CreateEventParams {
  idempotencyKey: string;
  paymentIntentId: string;
  gatewayEventId: string;
  gatewayOrderId: string;
  eventType: string;
  rawPayload: any;
  normalizedEvent: any;
  signature?: string;
  signatureVerified?: boolean;
  gateway?: string;
  checkoutSessionId?: string;
  notes?: any;
  metadata?: any;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

export interface ProcessResult {
  event: IWebhookEvent;
  checkoutSession?: any;
  orderIds: mongoose.Types.ObjectId[];
  orderStatuses: Record<string, string>;
  transactionId?: string;
  transactionStatus?: string;
}

export class WebhookEventService {
  private static instance: WebhookEventService;
  private readonly serverInstance: string;

  private constructor() {
    this.serverInstance =
      process.env.HOSTNAME ||
      process.env.POD_NAME ||
      crypto.randomUUID().slice(0, 8);
  }

  public static getInstance(): WebhookEventService {
    if (!WebhookEventService.instance) {
      WebhookEventService.instance = new WebhookEventService();
    }
    return WebhookEventService.instance;
  }

  /**
   * Generate lockKey from paymentId and eventType
   * This ensures each event type has its own unique lock
   */
  public generateLockKey(paymentIntentId: string, eventType: string): string {
    return `${paymentIntentId}_${eventType}`;
  }

  /**
   * ATOMIC: Create event and acquire lock in one operation
   * This eliminates the TOCTOU race condition
   *
   * ✅ FIXED: lockKey is now paymentId + eventType (unique per event type)
   */
  public async createAndLockEvent(
    params: CreateEventParams,
    lockTimeoutMs: number = 60000,
  ): Promise<LockResult> {
    const paymentLockKey = params.paymentIntentId;
    // ✅ FIXED: Generate lockKey from paymentId + eventType
    const lockKey = this.generateLockKey(
      params.paymentIntentId,
      params.eventType,
    );
    const lockedBy = crypto.randomUUID();
    const lockedInstance = this.serverInstance;
    const expiresAt = new Date(Date.now() + lockTimeoutMs);

    // ✅ FIXED: First check if event already exists by idempotencyKey
    const existingEvent = await WebhookEvent.findOne({
      idempotencyKey: params.idempotencyKey,
    });

    if (existingEvent) {
      logger.info("EVENT_EXISTS", "Event already exists", {
        idempotencyKey: params.idempotencyKey,
        status: existingEvent.status,
        lockKey: existingEvent.lockKey,
      });

      // If already processed, return appropriate status
      if (existingEvent.status === WebhookEventStatus.COMPLETED) {
        return {
          success: false,
          status: WebhookEventStatus.COMPLETED,
          error: "Event already completed",
          event: existingEvent,
        };
      }

      if (existingEvent.status === WebhookEventStatus.PROCESSING) {
        // Check if lock is expired
        if (existingEvent.expiresAt && existingEvent.expiresAt < new Date()) {
          // Try to steal the lock
          const stolenEvent = await WebhookEvent.findOneAndUpdate(
            {
              idempotencyKey: params.idempotencyKey,
              status: WebhookEventStatus.PROCESSING,
              expiresAt: { $lt: new Date() },
            },
            {
              $set: {
                lockVersion: existingEvent.lockVersion + 1,
                lockedAt: new Date(),
                expiresAt: new Date(Date.now() + lockTimeoutMs),
                lockedBy: lockedBy,
                lockedInstance: lockedInstance,
              },
              $push: {
                statusHistory: {
                  status: WebhookEventStatus.PROCESSING,
                  timestamp: new Date(),
                  reason: "Lock stolen (expired)",
                },
              },
            },
            {
              returnDocument: "after",
              runValidators: true,
            },
          );

          if (stolenEvent) {
            logger.info("LOCK_STOLEN", "Stole expired lock", {
              paymentId: paymentLockKey,
              idempotencyKey: params.idempotencyKey,
              previousOwner: existingEvent.lockedBy,
              newOwner: lockedBy,
            });
            return {
              success: true,
              event: stolenEvent,
              status: WebhookEventStatus.PROCESSING,
              lockAcquired: true,
            };
          }
        }

        // Someone else holds the lock
        return {
          success: false,
          status: WebhookEventStatus.PROCESSING,
          error: "Event is being processed by another instance",
          errorCategory: "lock_conflict",
          event: existingEvent,
        };
      }

      if (existingEvent.status === WebhookEventStatus.IGNORED) {
        return {
          success: false,
          status: WebhookEventStatus.IGNORED,
          error: "Event was ignored (stale)",
          event: existingEvent,
        };
      }

      return {
        success: false,
        status: existingEvent.status,
        error: `Event is in state: ${existingEvent.status}`,
        event: existingEvent,
      };
    }

    try {
      // ✅ FIXED: Atomic operation with lockKey = paymentId + eventType
      const event = await WebhookEvent.findOneAndUpdate(
        {
          idempotencyKey: params.idempotencyKey,
        },
        {
          $setOnInsert: {
            idempotencyKey: params.idempotencyKey,
            lockKey: lockKey, // ✅ FIXED: paymentId + eventType
            paymentLockKey: paymentLockKey,
            paymentIntentId: params.paymentIntentId,
            gatewayEventId: params.gatewayEventId,
            gatewayOrderId: params.gatewayOrderId || "",
            eventType: params.eventType,
            eventPriority: EVENT_PRIORITY[params.eventType] || 0,
            status: WebhookEventStatus.PROCESSING,
            rawPayload: params.rawPayload,
            normalizedEvent: params.normalizedEvent,
            signature: params.signature || "",
            signatureVerified: params.signatureVerified || false,
            gateway: params.gateway || "razorpay",
            checkoutSessionId: params.checkoutSessionId || null,
            notes: params.notes || {},
            metadata: {
              ...(params.metadata || {}),
              createdWith: "atomic-create-and-lock",
            },
            receivedAt: new Date(),
            requestId: params.requestId,
            ip: params.ip,
            userAgent: params.userAgent,
            retryCount: 0,
            maxRetries: 5,
            retryDelayMs: 1000,
            paymentAmount: params.normalizedEvent?.amount,
            paymentCurrency: params.normalizedEvent?.currency,
            paymentMethod: params.normalizedEvent?.paymentMethod,
            orderIds: [],
            statusHistory: [
              {
                status: WebhookEventStatus.PROCESSING,
                timestamp: new Date(),
                reason: "Lock acquired on creation",
              },
            ],
            lockVersion: 1,
            lockedAt: new Date(),
            expiresAt: expiresAt,
            lockedBy: lockedBy,
            lockedInstance: lockedInstance,
            processingStartedAt: new Date(),
          },
        },
        {
          upsert: true,
          returnDocument: "after",
          runValidators: true,
        },
      );

      if (!event) {
        return {
          success: false,
          error: "Failed to create event",
          errorCategory: "database",
        };
      }

      // Handle existing event states (in case of race condition)
      if (event.status === WebhookEventStatus.COMPLETED) {
        return {
          success: false,
          status: WebhookEventStatus.COMPLETED,
          error: "Event already completed",
          event,
        };
      }

      if (event.status === WebhookEventStatus.IGNORED) {
        return {
          success: false,
          status: WebhookEventStatus.IGNORED,
          error: "Event was ignored (stale)",
          event,
        };
      }

      if (event.status === WebhookEventStatus.PROCESSING) {
        // Check if we own the lock
        if (event.lockedBy === lockedBy) {
          logger.info("LOCK_ACQUIRED", "Lock acquired for event", {
            paymentId: paymentLockKey,
            eventType: params.eventType,
            lockKey: lockKey,
            idempotencyKey: params.idempotencyKey,
            lockedBy,
            lockedInstance,
          });
          return {
            success: true,
            event,
            status: WebhookEventStatus.PROCESSING,
            lockAcquired: true,
          };
        }

        // Check if lock is expired
        const isExpired = event.expiresAt && event.expiresAt < new Date();
        if (isExpired) {
          // Try to steal the lock
          const stolenEvent = await WebhookEvent.findOneAndUpdate(
            {
              idempotencyKey: params.idempotencyKey,
              status: WebhookEventStatus.PROCESSING,
              expiresAt: { $lt: new Date() },
            },
            {
              $set: {
                lockVersion: event.lockVersion + 1,
                lockedAt: new Date(),
                expiresAt: new Date(Date.now() + lockTimeoutMs),
                lockedBy: lockedBy,
                lockedInstance: lockedInstance,
              },
              $push: {
                statusHistory: {
                  status: WebhookEventStatus.PROCESSING,
                  timestamp: new Date(),
                  reason: "Lock stolen (expired)",
                },
              },
            },
            {
              returnDocument: "after",
              runValidators: true,
            },
          );

          if (stolenEvent) {
            logger.info("LOCK_STOLEN", "Stole expired lock", {
              paymentId: paymentLockKey,
              idempotencyKey: params.idempotencyKey,
              previousOwner: event.lockedBy,
              newOwner: lockedBy,
            });
            return {
              success: true,
              event: stolenEvent,
              status: WebhookEventStatus.PROCESSING,
              lockAcquired: true,
            };
          }
        }

        // Someone else holds the lock
        return {
          success: false,
          status: WebhookEventStatus.PROCESSING,
          error: "Event is being processed by another instance",
          errorCategory: "lock_conflict",
          event,
        };
      }

      // Any other status
      return {
        success: false,
        status: event.status,
        error: `Event is in state: ${event.status}`,
        event,
      };
    } catch (error: any) {
      // Duplicate key error - race condition
      if (error.code === 11000) {
        logger.warn("DUPLICATE_KEY_RACE", "Duplicate key race condition", {
          idempotencyKey: params.idempotencyKey,
          lockKey: lockKey,
          error: error.message,
        });

        // Exponential backoff retry for visibility
        await this.wait(100 * Math.pow(2, Math.random() * 3));

        // Fetch the event that was created
        const existingEvent = await WebhookEvent.findOne({
          idempotencyKey: params.idempotencyKey,
        });

        if (!existingEvent) {
          // Still not found - this is a real problem
          logger.error(
            "EVENT_NOT_FOUND_AFTER_DUPLICATE",
            "Event not found after duplicate key",
            {
              idempotencyKey: params.idempotencyKey,
              lockKey: lockKey,
            },
          );
          return {
            success: false,
            error: "Event not found after duplicate key",
            errorCategory: "database",
          };
        }

        // Return the existing event's status
        if (existingEvent.status === WebhookEventStatus.COMPLETED) {
          return {
            success: false,
            status: WebhookEventStatus.COMPLETED,
            error: "Event already completed",
            event: existingEvent,
          };
        }

        if (existingEvent.status === WebhookEventStatus.PROCESSING) {
          return {
            success: false,
            status: WebhookEventStatus.PROCESSING,
            error: "Event is being processed by another instance",
            errorCategory: "lock_conflict",
            event: existingEvent,
          };
        }

        return {
          success: false,
          status: existingEvent.status,
          error: `Event is in state: ${existingEvent.status}`,
          event: existingEvent,
        };
      }

      logger.error(
        "LOCK_ACQUISITION_ERROR",
        "Failed to create and lock event",
        {
          idempotencyKey: params.idempotencyKey,
          lockKey: lockKey,
          error: error.message,
        },
      );
      return {
        success: false,
        error: error.message,
        errorCategory: "database",
      };
    }
  }

  /**
   * Process event with transaction
   * Uses exponential backoff for transient errors
   */
  public async processEvent(
    event: IWebhookEvent,
    processFn: (
      session: mongoose.ClientSession,
      event: IWebhookEvent,
    ) => Promise<ProcessResult>,
    maxRetries: number = 5,
  ): Promise<ProcessResult> {
    let lastError: any;
    let delay = 50;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const session = await mongoose.startSession();

      try {
        session.startTransaction();

        // Double-check lock is still valid inside transaction
        const currentEvent = await WebhookEvent.findOne({
          idempotencyKey: event.idempotencyKey,
          status: WebhookEventStatus.PROCESSING,
        }).session(session);

        if (!currentEvent) {
          throw new Error("Event no longer locked or valid");
        }

        // Check if lock is still owned by us
        if (currentEvent.lockedBy !== event.lockedBy) {
          throw new Error("Lock was stolen by another instance");
        }

        // Execute business logic
        const result = await processFn(session, currentEvent);

        // Update event with processing results
        const updatedEvent = await WebhookEvent.findOneAndUpdate(
          { idempotencyKey: event.idempotencyKey },
          {
            $set: {
              status: WebhookEventStatus.COMPLETED,
              lockVersion: 0,
              processingCompletedAt: new Date(),
              processingDurationMs: currentEvent.processingStartedAt
                ? new Date().getTime() -
                  currentEvent.processingStartedAt.getTime()
                : 0,
              checkoutSessionId: result.checkoutSession?.checkoutSessionId,
              checkoutSessionStatus: result.checkoutSession?.status,
              orderIds: result.orderIds,
              orderStatuses: result.orderStatuses,
              transactionId: result.transactionId,
              transactionStatus: result.transactionStatus,
              processedBy: currentEvent.lockedBy,
              lockedAt: undefined,
              expiresAt: undefined,
              lockedBy: undefined,
              lockedInstance: undefined,
            },
            $push: {
              statusHistory: {
                status: WebhookEventStatus.COMPLETED,
                timestamp: new Date(),
              },
            },
          },
          { session, returnDocument: "after" },
        );

        await session.commitTransaction();
        logger.info("EVENT_PROCESSED", "Event processed successfully", {
          idempotencyKey: event.idempotencyKey,
          paymentId: event.paymentIntentId,
          eventType: event.eventType,
          attempt,
        });

        return {
          ...result,
          event: updatedEvent || event,
        };
      } catch (error: any) {
        await session.abortTransaction();
        session.endSession();

        // Check if error is retryable
        const isRetryable = this.isTransientError(error);

        if (isRetryable && attempt < maxRetries) {
          logger.warn("TRANSACTION_RETRY", "Retrying transaction", {
            idempotencyKey: event.idempotencyKey,
            attempt,
            maxRetries,
            delay,
            error: error.message,
          });

          await this.wait(delay);
          delay *= 2; // Exponential backoff
          lastError = error;
          continue;
        }

        // Non-retryable or max retries exceeded
        logger.error("TRANSACTION_FAILED", "Transaction failed", {
          idempotencyKey: event.idempotencyKey,
          paymentId: event.paymentIntentId,
          attempt,
          error: error.message,
          isRetryable,
          errorCategory: error.category || "unknown",
        });

        throw error;
      } finally {
        if (session) {
          session.endSession();
        }
      }
    }

    throw lastError;
  }

  /**
   * Determine if error is transient and should be retried
   */
  private isTransientError(error: any): boolean {
    // Transient MongoDB errors
    if (error.code === 112 || error.code === 11600 || error.code === 11601) {
      return true;
    }

    // Network errors
    if (
      error.message?.includes("ETIMEOUT") ||
      error.message?.includes("ECONNREFUSED") ||
      error.message?.includes("ECONNRESET")
    ) {
      return true;
    }

    // Write conflicts
    if (error.message?.includes("write conflict")) {
      return true;
    }

    // Transaction errors
    if (error.errorLabels) {
      if (error.errorLabels.includes("TransientTransactionError")) return true;
      if (error.errorLabels.includes("UnknownTransactionCommitResult"))
        return true;
    }

    // Lock conflicts (only if not stolen)
    if (error.message?.includes("lock") && !error.message?.includes("stolen")) {
      return true;
    }

    return false;
  }

  /**
   * Mark event as failed with retry classification
   */
  public async markFailed(
    idempotencyKey: string,
    error: Error,
    errorCategory?: string,
  ): Promise<void> {
    const event = await WebhookEvent.findOne({
      idempotencyKey,
      status: WebhookEventStatus.PROCESSING,
    });

    if (!event) {
      logger.warn("EVENT_NOT_FOUND", "Event not found or not processing", {
        idempotencyKey,
      });
      return;
    }

    const isRetryable = this.isTransientError(error);
    const shouldRetry = isRetryable && event.retryCount < event.maxRetries;

    if (shouldRetry) {
      // Schedule retry with exponential backoff
      const retryDelay = event.retryDelayMs * Math.pow(2, event.retryCount);
      const nextRetryAt = new Date(Date.now() + retryDelay);

      await WebhookEvent.findOneAndUpdate(
        { idempotencyKey },
        {
          $set: {
            status: WebhookEventStatus.PENDING,
            lockVersion: 0,
            processingCompletedAt: new Date(),
            processingDurationMs: event.processingStartedAt
              ? new Date().getTime() - event.processingStartedAt.getTime()
              : 0,
            errorMessage: error.message,
            errorStack: error.stack,
            errorCode: (error as any).code,
            errorCategory:
              errorCategory || (error as any).category || "processing_error",
            isRetryable: true,
            retryCount: event.retryCount + 1,
            nextRetryAt: nextRetryAt,
            lockedAt: undefined,
            expiresAt: undefined,
            lockedBy: undefined,
            lockedInstance: undefined,
          },
          $push: {
            statusHistory: {
              status: WebhookEventStatus.PENDING,
              timestamp: new Date(),
              reason: `Scheduled retry ${event.retryCount + 1}`,
            },
          },
        },
        { returnDocument: "after" },
      );

      logger.info("RETRY_SCHEDULED", "Event scheduled for retry", {
        idempotencyKey,
        retryCount: event.retryCount + 1,
        nextRetryAt,
        delay: retryDelay,
      });
    } else {
      // Permanent failure
      await WebhookEvent.findOneAndUpdate(
        { idempotencyKey },
        {
          $set: {
            status: WebhookEventStatus.FAILED,
            lockVersion: 0,
            processingCompletedAt: new Date(),
            processingDurationMs: event.processingStartedAt
              ? new Date().getTime() - event.processingStartedAt.getTime()
              : 0,
            errorMessage: error.message,
            errorStack: error.stack,
            errorCode: (error as any).code,
            errorCategory:
              errorCategory || (error as any).category || "processing_error",
            isRetryable: false,
            lockedAt: undefined,
            expiresAt: undefined,
            lockedBy: undefined,
            lockedInstance: undefined,
          },
          $push: {
            statusHistory: {
              status: WebhookEventStatus.FAILED,
              timestamp: new Date(),
              reason: error.message,
            },
          },
        },
        { returnDocument: "after" },
      );

      logger.error("EVENT_FAILED", "Event marked as failed", {
        idempotencyKey,
        error: error.message,
        errorCategory: errorCategory || "unknown",
        isRetryable: false,
        retryCount: event.retryCount,
      });
    }
  }

  /**
   * Mark event as ignored (stale out-of-order event)
   */
  public async markIgnored(
    idempotencyKey: string,
    reason: string,
  ): Promise<void> {
    await WebhookEvent.findOneAndUpdate(
      { idempotencyKey },
      {
        $set: {
          status: WebhookEventStatus.IGNORED,
          lockVersion: 0,
          processingCompletedAt: new Date(),
          lockedAt: undefined,
          expiresAt: undefined,
          lockedBy: undefined,
          lockedInstance: undefined,
        },
        $push: {
          statusHistory: {
            status: WebhookEventStatus.IGNORED,
            timestamp: new Date(),
            reason: reason,
          },
        },
      },
      { returnDocument: "after" },
    );

    logger.info("EVENT_IGNORED", "Event marked as ignored", {
      idempotencyKey,
      reason,
    });
  }

  /**
   * Check if event exists (idempotency check)
   */
  public async findEvent(idempotencyKey: string): Promise<{
    exists: boolean;
    event?: IWebhookEvent;
    status?: WebhookEventStatus;
    isProcessed?: boolean;
  }> {
    const event = await WebhookEvent.findOne({ idempotencyKey });

    if (!event) {
      return { exists: false };
    }

    return {
      exists: true,
      event,
      status: event.status,
      isProcessed:
        event.status === WebhookEventStatus.COMPLETED ||
        event.status === WebhookEventStatus.IGNORED,
    };
  }

  /**
   * Find events by payment
   */
  public async findEventsByPayment(
    paymentIntentId: string,
  ): Promise<IWebhookEvent[]> {
    return await WebhookEvent.find({
      paymentIntentId,
    }).sort({ receivedAt: 1 });
  }

  /**
   * Cleanup stale locks (maintenance task)
   */
  public async cleanupStaleLocks(): Promise<number> {
    const now = new Date();
    const result = await WebhookEvent.updateMany(
      {
        status: WebhookEventStatus.PROCESSING,
        expiresAt: { $lt: now },
      },
      {
        $set: {
          lockVersion: 0,
          lockedAt: undefined,
          expiresAt: undefined,
          lockedBy: undefined,
          lockedInstance: undefined,
        },
        $push: {
          statusHistory: {
            status: WebhookEventStatus.PENDING,
            timestamp: now,
            reason: "Stale lock cleaned up",
          },
        },
      },
    );

    if (result.modifiedCount > 0) {
      logger.info("STALE_LOCKS_CLEANED", "Cleaned up stale locks", {
        count: result.modifiedCount,
      });
    }

    return result.modifiedCount || 0;
  }

  /**
   * Save failed webhook for manual review
   */
  public async saveFailedWebhook(
    rawEvent: any,
    errorMessage?: string,
    errorCode?: string,
  ): Promise<IWebhookEvent> {
    const paymentIntentId =
      rawEvent?.paymentIntentId || rawEvent?.id || `failed_${Date.now()}`;
    const eventType = rawEvent?.eventType || WebhookEventType.SYSTEM_ERROR;
    const idempotencyKey = `failed_${Date.now()}_${crypto.randomUUID()}`;
    const lockKey = `${paymentIntentId}_${eventType}`;

    const event = new WebhookEvent({
      idempotencyKey,
      lockKey: lockKey,
      paymentLockKey: paymentIntentId,
      paymentIntentId,
      gatewayEventId: rawEvent?.gatewayEventId || `failed_${Date.now()}`,
      gatewayOrderId: rawEvent?.orderId || paymentIntentId,
      eventType,
      eventPriority: 0,
      status: WebhookEventStatus.FAILED,
      rawPayload: rawEvent,
      normalizedEvent: rawEvent,
      receivedAt: new Date(),
      processingCompletedAt: new Date(),
      errorMessage,
      errorCode,
      errorCategory: "manual_review",
      isRetryable: false,
      metadata: {
        isManualReview: true,
        savedAt: new Date(),
        originalEventType: rawEvent?.eventType || "unknown",
      },
      notes: {},
      retryCount: 0,
      maxRetries: 0,
      orderIds: [],
      statusHistory: [
        {
          status: WebhookEventStatus.FAILED,
          timestamp: new Date(),
          reason: "Saved for manual review",
        },
      ],
    });

    await event.save();
    logger.info(
      "FAILED_WEBHOOK_SAVED",
      "Failed webhook saved for manual review",
      {
        idempotencyKey,
        paymentId: paymentIntentId,
        lockKey: lockKey,
      },
    );

    return event;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default WebhookEventService.getInstance();
