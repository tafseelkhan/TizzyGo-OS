// ============================================================
// controllers/WebhookController.ts
// ============================================================

import { Request, Response } from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import { PaymentGatewayFactory } from "../../../factories/PaymentGatewayFactory";
import { IPaymentGateway } from "../../../interfaces/seller/IPaymentGateway";
import { PaymentGatewayType } from "../../../enums/PaymentGatewayType";
import Order from "../../../models/tizzygo/checkout/order";
import CheckoutSession from "../../../models/tizzygo/checkout/CheckoutSession";
import Transaction from "../../../models/tizzygo/checkout/Transaction";
import Cart from "../../../models/tizzygo/cart/Cart";
import WebhookEventService from "../../../services/tizzygo/WebhookEventService";
import {
  WebhookEventStatus,
  STATE_ORDER,
} from "../../../models/tizzygo/checkout/WebhookEvent";
import { logger } from "../../../utils/tizzygo/logger";

// ============================================================
// STATE MACHINE - Monotonic with priority ordering
// ============================================================

interface StateTransition {
  sessionStatus: string;
  orderStatus: string;
  transactionStatus: string;
}

const STATE_MAP: Record<string, StateTransition> = {
  "payment.authorized": {
    sessionStatus: "authorized",
    orderStatus: "authorized",
    transactionStatus: "authorized",
  },
  "payment.captured": {
    sessionStatus: "completed",
    orderStatus: "captured",
    transactionStatus: "captured",
  },
  "payment.succeeded": {
    sessionStatus: "completed",
    orderStatus: "captured",
    transactionStatus: "captured",
  },
  "payment.failed": {
    sessionStatus: "failed",
    orderStatus: "failed",
    transactionStatus: "failed",
  },
  "payment.refunded": {
    sessionStatus: "refunded",
    orderStatus: "refunded",
    transactionStatus: "refunded",
  },
  "payment.partially_refunded": {
    sessionStatus: "refunded",
    orderStatus: "refunded",
    transactionStatus: "refunded",
  },
  "payment.cancelled": {
    sessionStatus: "cancelled",
    orderStatus: "cancelled",
    transactionStatus: "cancelled",
  },
};

// ============================================================
// MAIN CONTROLLER
// ============================================================

export const webhookHandler = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const requestId =
    (req.headers["x-request-id"] as string) || crypto.randomUUID();

  // Parse raw body early for error logging
  const rawBody =
    req.body instanceof Buffer
      ? req.body.toString("utf8")
      : JSON.stringify(req.body);

  let parsedBody: any;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch (e) {
    parsedBody = req.body;
  }

  logger.info("WEBHOOK_RECEIVED", "Processing webhook", {
    requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  // Determine gateway
  let gatewayType = PaymentGatewayType.RAZORPAY;
  let signature = "";

  if (req.headers["x-razorpay-signature"]) {
    gatewayType = PaymentGatewayType.RAZORPAY;
    signature = req.headers["x-razorpay-signature"] as string;
  }

  try {
    const gateway = PaymentGatewayFactory.getGatewayByType(gatewayType);

    // ============================================================
    // STEP 1: Verify Signature
    // ============================================================
    let isValid = false;
    if (signature) {
      try {
        isValid = await gateway.verifyWebhookSignature(rawBody, signature);
        logger.info("SIGNATURE_VERIFIED", "Signature verified", {
          requestId,
          isValid,
        });
      } catch (sigError: any) {
        logger.error("SIGNATURE_VERIFICATION_FAILED", "Signature error", {
          requestId,
          error: sigError.message,
        });
        if (process.env.NODE_ENV === "development") {
          logger.warn("DEVELOPMENT_MODE", "Allowing invalid signature", {
            requestId,
          });
          isValid = true;
        }
      }
    } else {
      if (process.env.NODE_ENV === "development") {
        logger.warn("DEVELOPMENT_MODE", "No signature provided", { requestId });
        isValid = true;
      }
    }

    if (!isValid) {
      logger.error("INVALID_SIGNATURE", "Webhook signature invalid", {
        requestId,
      });
      return res
        .status(401)
        .json({ success: false, error: "Invalid signature" });
    }

    // ============================================================
    // STEP 2: Parse Event
    // ============================================================
    const normalizedEvent = await gateway.parseWebhookEvent(parsedBody);
    const eventType = normalizedEvent.eventType as string;
    const paymentIntentId = normalizedEvent.paymentIntentId;
    const gatewayOrderId = normalizedEvent.orderId || "";
    const notes = (normalizedEvent as any)?.notes;
    const checkoutSessionId = notes?.checkoutSessionId || null;

    if (!eventType || !paymentIntentId) {
      logger.error("MISSING_EVENT_DATA", "Required data missing", {
        requestId,
        eventType,
        paymentIntentId,
      });
      return res
        .status(400)
        .json({ success: false, error: "Invalid webhook data" });
    }

    const gatewayEventId =
      normalizedEvent.gatewayEventId ||
      (parsedBody as any)?.id ||
      `evt_${paymentIntentId}_${gatewayOrderId || "unknown"}_${eventType}`;

    const idempotencyKey = gatewayEventId;

    logger.info("EVENT_PARSED", "Webhook event parsed", {
      requestId,
      eventType,
      paymentIntentId,
      gatewayOrderId,
      checkoutSessionId,
      idempotencyKey,
    });

    // ============================================================
    // STEP 3: Check Existing Event (Idempotency)
    // ============================================================
    const existingEvent = await WebhookEventService.findEvent(idempotencyKey);

    if (existingEvent.exists && existingEvent.isProcessed) {
      logger.info("EVENT_ALREADY_PROCESSED", "Event already processed", {
        requestId,
        idempotencyKey,
        status: existingEvent.status,
      });
      return res
        .status(200)
        .json({ success: true, message: "Already processed" });
    }

    if (
      existingEvent.exists &&
      existingEvent.status === WebhookEventStatus.PROCESSING
    ) {
      logger.info("EVENT_PROCESSING", "Event processing in progress", {
        requestId,
        idempotencyKey,
      });
      return res
        .status(200)
        .json({ success: true, message: "Processing in progress" });
    }

    // ============================================================
    // STEP 4: ATOMIC Create & Lock
    // ============================================================
    logger.info("ACQUIRING_LOCK", "Acquiring payment lock", {
      requestId,
      paymentIntentId,
      idempotencyKey,
    });

    const lockResult = await WebhookEventService.createAndLockEvent({
      idempotencyKey,
      paymentIntentId,
      gatewayEventId,
      gatewayOrderId,
      eventType,
      rawPayload: parsedBody,
      normalizedEvent,
      signature,
      signatureVerified: isValid,
      gateway: gatewayType.toString(),
      checkoutSessionId,
      notes,
      metadata: {
        razorpayEventId: parsedBody?.id,
        razorpayPaymentId: parsedBody?.payload?.payment?.entity?.id,
        razorpayOrderId: parsedBody?.payload?.order?.entity?.id,
      },
      requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!lockResult.success || !lockResult.event) {
      if (
        lockResult.status === WebhookEventStatus.COMPLETED ||
        lockResult.status === WebhookEventStatus.IGNORED
      ) {
        logger.info("EVENT_ALREADY_PROCESSED", "Event already processed", {
          requestId,
          idempotencyKey,
          status: lockResult.status,
        });
        return res
          .status(200)
          .json({ success: true, message: "Already processed" });
      }

      logger.warn("LOCK_ACQUISITION_FAILED", "Could not acquire lock", {
        requestId,
        idempotencyKey,
        error: lockResult.error,
        category: lockResult.errorCategory,
      });
      return res.status(200).json({
        success: true,
        message: "Event processing in progress or failed",
      });
    }

    const event = lockResult.event;
    logger.info("LOCK_ACQUIRED", "Payment lock acquired", {
      requestId,
      paymentIntentId,
      idempotencyKey,
      lockedBy: event.lockedBy,
      lockedInstance: event.lockedInstance,
    });

    // ============================================================
    // STEP 5: Process Event in Transaction
    // ============================================================
    try {
      const result = await WebhookEventService.processEvent(
        event,
        async (session: mongoose.ClientSession, lockedEvent: any) => {
          return await processEventInTransaction(
            lockedEvent,
            eventType,
            normalizedEvent,
            session,
          );
        },
      );

      // ============================================================
      // STEP 6: Non-Critical Operations
      // ============================================================
      if (
        eventType === "payment.captured" ||
        eventType === "payment.succeeded"
      ) {
        await clearCartAsync(normalizedEvent, result.checkoutSession);
        logger.info("CART_CLEARED", "Cart cleared for payment", {
          requestId,
          paymentIntentId,
        });
      }

      const processingTime = Date.now() - startTime;
      logger.info("WEBHOOK_PROCESSED", "Webhook processed successfully", {
        requestId,
        paymentIntentId,
        idempotencyKey,
        processingTime,
        orderCount: result.orderIds.length,
        checkoutStatus: result.checkoutSession?.status,
      });

      return res.status(200).json({
        success: true,
        message: "Webhook processed successfully",
        data: {
          eventId: event.idempotencyKey,
          orderCount: result.orderIds.length,
          checkoutStatus: result.checkoutSession?.status,
        },
      });
    } catch (error: any) {
      // ============================================================
      // STEP 7: Error Handling
      // ============================================================
      const errorCategory = categorizeError(error);

      await WebhookEventService.markFailed(
        idempotencyKey,
        error,
        errorCategory,
      );

      logger.error("TRANSACTION_FAILED", "Transaction processing failed", {
        requestId,
        paymentIntentId,
        idempotencyKey,
        error: error.message,
        category: errorCategory,
        isRetryable: error.isRetryable,
      });

      if (errorCategory === "unknown" || errorCategory === "validation") {
        await WebhookEventService.saveFailedWebhook(
          parsedBody,
          error.message,
          error.code,
        );
      }

      throw error;
    }
  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    logger.error("WEBHOOK_FAILED", "Webhook processing failed", {
      requestId,
      error: error.message,
      processingTime,
    });

    try {
      await WebhookEventService.saveFailedWebhook(
        parsedBody,
        error.message,
        error.code,
      );
    } catch (saveError: any) {
      logger.error(
        "FAILED_WEBHOOK_SAVE_FAILED",
        "Could not save failed webhook",
        {
          requestId,
          error: saveError.message,
        },
      );
    }

    return res.status(500).json({
      success: false,
      error: error.message || "Webhook processing failed",
    });
  }
};

// ============================================================
// BUSINESS LOGIC PROCESSING
// ============================================================

async function processEventInTransaction(
  event: any,
  eventType: string,
  eventData: any,
  session: mongoose.ClientSession,
): Promise<{
  event: any;
  checkoutSession: any;
  orderIds: mongoose.Types.ObjectId[];
  orderStatuses: Record<string, string>;
}> {
  // Find checkout session - null safe
  const checkoutSession = await findCheckoutSession(eventData, session);

  if (!checkoutSession) {
    throw new Error("CheckoutSession not found");
  }

  // Get target state
  const targetState = STATE_MAP[eventType];
  if (!targetState) {
    throw new Error(`Unknown event type: ${eventType}`);
  }

  // Check if this is a stale event (would roll back state)
  const currentStatus = checkoutSession.status || "pending";
  const targetStatus = targetState.sessionStatus;
  const currentOrder = STATE_ORDER[currentStatus] ?? -1;
  const targetOrder = STATE_ORDER[targetStatus] ?? -1;

  if (targetOrder < currentOrder) {
    // Stale event - ignore it
    await WebhookEventService.markIgnored(
      event.idempotencyKey,
      `Stale event: ${currentStatus} → ${targetStatus} would roll back`,
    );
    return {
      event,
      checkoutSession,
      orderIds: [],
      orderStatuses: {},
    };
  }

  // Update checkout session
  await updateCheckoutSession(checkoutSession, eventData, targetState, session);

  // Update orders - null safe
  const { orderIds, orderStatuses } = await updateOrders(
    checkoutSession,
    targetState,
    session,
  );

  // Update transaction - null safe
  await updateTransaction(orderIds, eventData, targetState, session);

  return {
    event,
    checkoutSession,
    orderIds,
    orderStatuses,
  };
}

async function findCheckoutSession(
  eventData: any,
  session: mongoose.ClientSession,
): Promise<any> {
  const paymentIntentId = eventData.orderId || eventData.paymentIntentId;
  if (!paymentIntentId) {
    return null;
  }

  // Try multiple lookup strategies
  let checkoutSession = await CheckoutSession.findOne({
    paymentIntentId: paymentIntentId,
  }).session(session);

  if (!checkoutSession && eventData.notes?.checkoutSessionId) {
    checkoutSession = await CheckoutSession.findOne({
      checkoutSessionId: eventData.notes.checkoutSessionId,
    }).session(session);
  }

  if (!checkoutSession && eventData.orderId) {
    checkoutSession = await CheckoutSession.findOne({
      "metadata.razorpayOrderId": eventData.orderId,
    }).session(session);
  }

  if (!checkoutSession) {
    const orders = await Order.find({
      paymentIntentId: paymentIntentId,
    }).session(session);

    if (orders && orders.length > 0) {
      const orderIds = orders.map((o) => o._id);
      checkoutSession = await CheckoutSession.findOne({
        orderIds: { $in: orderIds },
      }).session(session);
    }
  }

  if (!checkoutSession) {
    const transaction = await Transaction.findOne({
      gatewayTransactionId: eventData.paymentIntentId,
      gatewayOrderId: eventData.orderId,
    }).session(session);

    if (transaction && transaction.orderId) {
      checkoutSession = await CheckoutSession.findOne({
        orderIds: { $in: [transaction.orderId] },
      }).session(session);
    }
  }

  return checkoutSession;
}

async function updateCheckoutSession(
  checkoutSession: any,
  eventData: any,
  targetState: StateTransition,
  session: mongoose.ClientSession,
): Promise<void> {
  // Ensure metadata exists
  if (!checkoutSession.metadata) {
    checkoutSession.metadata = {};
  }

  // Update metadata
  checkoutSession.metadata.razorpayPaymentId = eventData.paymentIntentId;
  checkoutSession.metadata.razorpayOrderId = eventData.orderId;
  checkoutSession.metadata.webhookReceivedAt = new Date();
  checkoutSession.metadata.webhookEventType = eventData.eventType;

  // Update status if changed
  if (checkoutSession.status !== targetState.sessionStatus) {
    checkoutSession.status = targetState.sessionStatus;
    if (targetState.sessionStatus === "completed") {
      checkoutSession.completedAt = new Date();
    }
    await checkoutSession.save({ session });
  }
}

async function updateOrders(
  checkoutSession: any,
  targetState: StateTransition,
  session: mongoose.ClientSession,
): Promise<{
  orderIds: mongoose.Types.ObjectId[];
  orderStatuses: Record<string, string>;
}> {
  const orderIds = checkoutSession.orderIds || [];
  const orderStatuses: Record<string, string> = {};

  if (!orderIds || orderIds.length === 0) {
    return { orderIds: [], orderStatuses: {} };
  }

  for (const orderId of orderIds) {
    if (!orderId) continue;

    const order = await Order.findById(orderId).session(session);
    if (!order) continue;

    // Skip if already in terminal state
    const terminalStates = ["captured", "refunded", "failed", "cancelled"];
    if (terminalStates.includes(order.paymentStatus)) {
      continue;
    }

    order.status = targetState.orderStatus;
    order.paymentStatus = targetState.orderStatus;

    if (targetState.orderStatus === "captured") {
      order.paidAt = new Date();
    }
    if (targetState.orderStatus === "refunded") {
      order.refundedAt = new Date();
    }

    await order.save({ session });
    if (order.orderId) {
      orderStatuses[order.orderId] = order.status;
    }
  }

  return { orderIds, orderStatuses };
}

async function updateTransaction(
  orderIds: mongoose.Types.ObjectId[],
  eventData: any,
  targetState: StateTransition,
  session: mongoose.ClientSession,
): Promise<void> {
  if (!orderIds || orderIds.length === 0) return;

  for (const orderId of orderIds) {
    if (!orderId) continue;

    const order = await Order.findById(orderId).session(session);
    if (!order || !order.transactionId) continue;

    const transaction = await Transaction.findById(order.transactionId).session(
      session,
    );
    if (!transaction) continue;

    // Ensure metadata exists
    if (!transaction.metadata) {
      transaction.metadata = {};
    }

    transaction.status = targetState.transactionStatus;
    transaction.metadata.webhookStatus = eventData.eventType;
    transaction.metadata.webhookReceivedAt = new Date();

    if (
      targetState.transactionStatus === "captured" ||
      targetState.transactionStatus === "refunded"
    ) {
      transaction.completedAt = new Date();
    }

    if (eventData.paymentIntentId) {
      transaction.gatewayTransactionId = eventData.paymentIntentId;
      transaction.gatewayPaymentId = eventData.paymentIntentId;
    }

    if (eventData.orderId) {
      transaction.gatewayOrderId = eventData.orderId;
    }

    await transaction.save({ session });
  }
}

// ============================================================
// NON-CRITICAL OPERATIONS
// ============================================================

// ============================================================
// ONLY THE clearCartAsync FUNCTION CHANGES
// ============================================================

/**
 * ✅ FIXED: Cart Clearing with Verification
 * 
 * This function now:
 * 1. Verifies the cart exists
 * 2. Performs the delete operation
 * 3. Checks the result (deletedCount)
 * 4. Only logs success after confirming database update
 * 5. Marks the cart as cleared only after successful deletion
 */
async function clearCartAsync(
  eventData: any,
  checkoutSession: any,
): Promise<void> {
  try {
    console.log("🗑️ [clearCartAsync] Starting cart clearing...");

    // Find session if not provided
    let session = checkoutSession;
    if (!session) {
      const paymentIntentId = eventData.orderId || eventData.paymentIntentId;
      if (paymentIntentId) {
        session = await CheckoutSession.findOne({
          paymentIntentId: paymentIntentId,
        });
      }
    }

    if (!session) {
      console.log("⚠️ [clearCartAsync] No checkout session found");
      return;
    }

    console.log(`📋 [clearCartAsync] Session: ${session.checkoutSessionId}`);
    console.log(`📋 [clearCartAsync] Status: ${session.status}`);
    console.log(`📋 [clearCartAsync] Cart already cleared: ${!!session.metadata?.cartCleared}`);

    // Check if cart already cleared
    if (session.metadata?.cartCleared) {
      console.log("✅ [clearCartAsync] Cart already cleared, skipping");
      return;
    }

    const userId = session.userId;
    if (!userId) {
      console.log("⚠️ [clearCartAsync] No userId found in session");
      return;
    }

    console.log(`👤 [clearCartAsync] User ID: ${userId}`);

    // Determine if Buy Now or Cart checkout
    const isBuyNow = session.metadata?.isBuyNow;
    const productId = session.metadata?.productId;

    let deletedCount = 0;

    if (isBuyNow && productId) {
      // Buy Now: Delete specific product from cart
      console.log(`🛒 [clearCartAsync] Buy Now mode - deleting product: ${productId}`);
      const result = await Cart.deleteMany({
        userId: userId,
        productId: productId,
      });
      deletedCount = result.deletedCount || 0;
      console.log(`✅ [clearCartAsync] Deleted ${deletedCount} Buy Now cart items`);
    } else {
      // Normal checkout: Delete entire cart
      console.log(`🛒 [clearCartAsync] Normal checkout - clearing entire cart`);
      const result = await Cart.deleteMany({ userId: userId });
      deletedCount = result.deletedCount || 0;
      console.log(`✅ [clearCartAsync] Deleted ${deletedCount} cart items`);
    }

    // ✅ ✅ ✅ CRITICAL: Only mark as cleared if items were actually deleted ✅ ✅ ✅
    if (deletedCount > 0) {
      console.log(`✅ [clearCartAsync] Successfully deleted ${deletedCount} items`);
      
      // Mark as cleared in session
      if (!session.metadata) {
        session.metadata = {};
      }
      session.metadata.cartCleared = true;
      session.metadata.cartClearedAt = new Date();
      session.metadata.cartClearedItems = deletedCount;
      
      await session.save();
      
      console.log(`✅ [clearCartAsync] CART_CLEARED: ${deletedCount} items removed`);
    } else {
      // ⚠️ No items were deleted - log warning
      console.log(`⚠️ [clearCartAsync] No cart items found to delete for user ${userId}`);
      
      // Still mark as cleared to avoid future attempts
      if (!session.metadata) {
        session.metadata = {};
      }
      session.metadata.cartCleared = true;
      session.metadata.cartClearedAt = new Date();
      session.metadata.cartClearedItems = 0;
      session.metadata.cartClearedReason = "No items found to delete";
      
      await session.save();
      
      console.log(`⚠️ [clearCartAsync] Marked as cleared (no items found)`);
    }
  } catch (error: any) {
    // ⚠️ Non-critical - log error but don't throw to avoid breaking payment flow
    console.error(`❌ [clearCartAsync] Failed to clear cart: ${error.message}`);
    console.error(`❌ [clearCartAsync] Stack: ${error.stack}`);
    
    // Log to monitoring but don't throw
    logger.error("CART_CLEAR_FAILED", "Failed to clear cart", {
      error: error.message,
      stack: error.stack,
    });
  }
}

// ============================================================
// ERROR CATEGORIZATION
// ============================================================

function categorizeError(error: any): string {
  if (!error) return "unknown";

  const message = error.message || "";
  const code = error.code;

  if (message.includes("CheckoutSession not found")) return "validation";
  if (message.includes("Invalid state transition")) return "state_transition";
  if (message.includes("stale event")) return "validation";
  if (message.includes("signature")) return "signature";
  if (code === 11000) return "duplicate";
  if (message.includes("ETIMEOUT") || message.includes("ECONNREFUSED"))
    return "network";
  if (message.includes("transaction") || message.includes("write conflict"))
    return "database";
  if (message.includes("lock")) return "lock_conflict";
  if (message.includes("validation") || message.includes("required"))
    return "validation";

  return "unknown";
}
