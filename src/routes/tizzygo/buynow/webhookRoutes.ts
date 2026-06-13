import { ZeptPay } from "@flixora/zeptpay-payment-core";
import express from "express";
import mongoose from "mongoose";

import Order from "../../../models/tizzyos/shipping/order/order";
import CheckoutSession from "../../../models/tizzygo/checkout/CheckoutSession";
import Cart from "../../../models/tizzygo/cart/Cart";

const router = express.Router();

/* -------------------------------------------------- */
/* TYPES */
/* -------------------------------------------------- */

type PaymentStatus =
  | "created"
  | "processing"
  | "authorized"
  | "captured"
  | "failed"
  | "cancelled"
  | "refunded";

interface WebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
  created: number;
  raw: any;
}

/* -------------------------------------------------- */
/* HELPERS */
/* -------------------------------------------------- */

const processedWebhookEvents = new Set<string>();

// Cleanup duplicate cache every 10 min
setInterval(
  () => {
    if (processedWebhookEvents.size > 5000) {
      processedWebhookEvents.clear();
      console.log("🧹 Cleared processed webhook events cache");
    }
  },
  10 * 60 * 1000,
);

function normalizePaymentIntentId(response: any): string | null {
  return (
    response?.zeptpayTransactionId ||
    response?.paymentIntentId ||
    response?.transactionId ||
    response?.id ||
    null
  );
}

async function updatePaymentAttempt(
  order: any,
  paymentIntentId: string,
  status: PaymentStatus,
  additionalData?: any,
) {
  const attemptIndex = order.paymentAttempts.findIndex(
    (attempt: any) => attempt.paymentIntentId === paymentIntentId,
  );

  if (attemptIndex !== -1) {
    order.paymentAttempts[attemptIndex].status = status;

    if (additionalData) {
      order.paymentAttempts[attemptIndex].rawResponse = {
        ...(order.paymentAttempts[attemptIndex].rawResponse || {}),
        ...additionalData,
      };
    }

    order.paymentAttempts[attemptIndex].updatedAt = new Date();

    return;
  }

  console.log(
    `⚠️ Payment attempt not found. Creating new attempt for ${paymentIntentId}`,
  );

  order.paymentAttempts.push({
    paymentIntentId,
    method: additionalData?.method || "unknown",
    status,
    rawResponse: additionalData || {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

/* -------------------------------------------------- */
/* ZEPTPAY SDK */
/* -------------------------------------------------- */

if (!process.env.ZEPTPAY_WEBHOOK_KEY) {
  throw new Error("ZEPTPAY_WEBHOOK_KEY is missing in environment");
}

const zeptpay = new ZeptPay({
  webhookKey: process.env.ZEPTPAY_WEBHOOK_KEY,
});

/* -------------------------------------------------- */
/* WEBHOOK */
/* -------------------------------------------------- */

router.post(
  "/",
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
  async (req, res) => {
    let mongoSession: mongoose.ClientSession | null = null;

    try {
      /* -------------------------------------------------- */
      /* HEADERS */
      /* -------------------------------------------------- */

      const signature = req.headers["x-zeptpay-signature"] as string;
      const timestamp = req.headers["x-zeptpay-timestamp"] as string;

      if (!signature || !timestamp) {
        console.error("❌ Missing webhook headers");

        return res.status(400).json({
          success: false,
          error: "Missing webhook headers",
        });
      }

      /* -------------------------------------------------- */
      /* VERIFY WEBHOOK */
      /* -------------------------------------------------- */

      const event = zeptpay.flixora.webhook.verifyEventZPTFXO(
        req.body,
        signature,
        timestamp,
        process.env.ZEPTPAY_WEBHOOK_KEY!,
      ) as WebhookEvent;

      console.log(`✅ Verified webhook event: ${event.type}`);

      const transaction = event.data?.object || {};

      const paymentIntentId = normalizePaymentIntentId(transaction) || event.id;

      if (!paymentIntentId) {
        console.error("❌ paymentIntentId missing");

        return res.status(400).json({
          success: false,
          error: "paymentIntentId missing",
        });
      }

      /* -------------------------------------------------- */
      /* IDEMPOTENCY */
      /* -------------------------------------------------- */

      const eventUniqueId = `${event.type}-${paymentIntentId}`;

      if (processedWebhookEvents.has(eventUniqueId)) {
        console.log(`🔄 Duplicate webhook ignored: ${eventUniqueId}`);

        return res.json({
          success: true,
          duplicate: true,
        });
      }

      /* -------------------------------------------------- */
      /* FIND ORDER */
      /* -------------------------------------------------- */

      const checkoutSessionId =
        transaction?.meta?.checkoutSessionId ||
        transaction?.metadata?.checkoutSessionId ||
        transaction?.checkoutSessionId;

      let checkoutSession: any = null;
      let order: any = null;

      if (checkoutSessionId) {
        checkoutSession = await CheckoutSession.findOne({
          checkoutSessionId,
        });

        if (checkoutSession) {
          order = await Order.findById(checkoutSession.orderId);
        }
      }

      // fallback
      if (!order) {
        order = await Order.findOne({
          "paymentAttempts.paymentIntentId": paymentIntentId,
        });
      }

      if (!order) {
        console.error(
          `❌ Order not found for paymentIntentId: ${paymentIntentId}`,
        );

        return res.status(404).json({
          success: false,
          error: "Order not found",
        });
      }

      /* -------------------------------------------------- */
      /* DB TRANSACTION */
      /* -------------------------------------------------- */

      mongoSession = await mongoose.startSession();

      mongoSession.startTransaction();

      console.log(`📦 Processing webhook for order ${order.orderId}`);

      /* -------------------------------------------------- */
      /* HANDLE EVENTS */
      /* -------------------------------------------------- */

      switch (event.type) {
        /* ---------------- CREATED ---------------- */

        case "zeptpay-flixora.payment_intent.created": {
          await updatePaymentAttempt(
            order,
            paymentIntentId,
            "created",
            transaction,
          );

          order.status = "created";
          order.paymentStatus = "created";

          break;
        }

        /* ---------------- PROCESSING ---------------- */

        case "zeptpay-flixora.payment_intent.processing":
        case "zeptpay-flixora.payment_intent.requires_action": {
          await updatePaymentAttempt(
            order,
            paymentIntentId,
            "processing",
            transaction,
          );

          if (order.status !== "captured" && order.status !== "authorized") {
            order.status = "processing";
            order.paymentStatus = "processing";
          }

          break;
        }

        /* ---------------- AUTHORIZED ---------------- */

        case "zeptpay-flixora.payment_intent.authorized": {
          await updatePaymentAttempt(
            order,
            paymentIntentId,
            "authorized",
            transaction,
          );

          order.status = "authorized";
          order.paymentStatus = "authorized";
          order.paymentIntentId = paymentIntentId;
          order.paymentGateway = "zeptpay";

          break;
        }

        /* ---------------- SUCCESS ---------------- */

        case "zeptpay-flixora.payment_intent.succeeded": {
          await updatePaymentAttempt(
            order,
            paymentIntentId,
            "captured",
            transaction,
          );

          order.status = "captured";
          order.paymentStatus = "captured";
          order.paymentIntentId = paymentIntentId;
          order.paymentGateway = "zeptpay";
          order.paidAt = new Date();

          if (checkoutSession) {
            checkoutSession.status = "completed";
            checkoutSession.paymentIntentId = paymentIntentId;
            checkoutSession.completedAt = new Date();

            await checkoutSession.save({
              session: mongoSession,
            });
          }

          // Clear cart after success
          if (order.buyerId) {
            await Cart.deleteMany(
              {
                userId: order.buyerId,
              },
              {
                session: mongoSession,
              },
            );
          }

          console.log(`✅ Payment captured for ${order.orderId}`);

          break;
        }

        /* ---------------- FAILED ---------------- */

        case "zeptpay-flixora.payment_intent.payment_failed": {
          await updatePaymentAttempt(
            order,
            paymentIntentId,
            "failed",
            transaction,
          );

          order.status = "failed";
          order.paymentStatus = "failed";

          if (checkoutSession) {
            checkoutSession.status = "failed";
            checkoutSession.failedAt = new Date();

            await checkoutSession.save({
              session: mongoSession,
            });
          }

          console.log(`❌ Payment failed for ${order.orderId}`);

          break;
        }

        /* ---------------- CANCELLED ---------------- */

        case "zeptpay-flixora.payment_intent.canceled": {
          await updatePaymentAttempt(
            order,
            paymentIntentId,
            "cancelled",
            transaction,
          );

          if (order.status !== "captured" && order.status !== "authorized") {
            order.status = "cancelled";
            order.paymentStatus = "failed";
          }

          if (checkoutSession) {
            checkoutSession.status = "expired";
            checkoutSession.expiredAt = new Date();

            await checkoutSession.save({
              session: mongoSession,
            });
          }

          break;
        }

        /* ---------------- REFUND ---------------- */

        case "zeptpay-flixora.charge.refunded": {
          await updatePaymentAttempt(
            order,
            paymentIntentId,
            "refunded",
            transaction,
          );

          order.status = "refunded";
          order.paymentStatus = "refunded";
          order.refundedAt = new Date();

          break;
        }

        /* ---------------- UNKNOWN ---------------- */

        default: {
          console.log(`⚠️ Unknown webhook event: ${event.type}`);
        }
      }

      /* -------------------------------------------------- */
      /* SAVE ORDER */
      /* -------------------------------------------------- */

      await order.save({
        session: mongoSession,
      });

      /* -------------------------------------------------- */
      /* MARK EVENT DONE */
      /* -------------------------------------------------- */

      processedWebhookEvents.add(eventUniqueId);

      await mongoSession.commitTransaction();
      mongoSession.endSession();

      console.log(
        `✅ Webhook processed successfully for order ${order.orderId}`,
      );

      return res.json({
        success: true,
        received: true,
      });
    } catch (error: any) {
      console.error("❌ WEBHOOK ERROR:", error);

      if (mongoSession) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
      }

      return res.status(400).json({
        success: false,
        error: error.message || "Webhook failed",
      });
    }
  },
);

export default router;
