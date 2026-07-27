// src/controllers/tizzygo/payment/webhookController.ts - FINAL FIXED VERSION

import { Request, Response } from "express";
import mongoose from "mongoose";
import { PaymentGatewayFactory } from "../../../factories/PaymentGatewayFactory";
import { IPaymentGateway } from "../../../interfaces/seller/IPaymentGateway";
import { PaymentGatewayType } from "../../../enums/PaymentGatewayType";
import Order from "../../../models/tizzygo/checkout/order";
import CheckoutSession from "../../../models/tizzygo/checkout/CheckoutSession";
import WebhookEvent from "../../../models/tizzygo/checkout/WebhookEvent";
import Transaction from "../../../models/tizzygo/checkout/Transaction";

// ✅ Retry function with exponential backoff
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 100,
): Promise<T> => {
  let lastError: any;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // ✅ Only retry on write conflict
      if (error.code === 112 || error.codeName === "WriteConflict") {
        console.log(
          `⚠️ Write conflict, retry ${attempt}/${maxRetries} after ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }

      // ✅ For other errors, throw immediately
      throw error;
    }
  }

  throw lastError;
};

export const webhookHandler = async (req: Request, res: Response) => {
  console.log("========================================");
  console.log("🔔 WEBHOOK RECEIVED");
  console.log("========================================");
  console.log("URL:", req.url);
  console.log("Method:", req.method);

  const rawBody =
    req.body instanceof Buffer
      ? req.body.toString("utf8")
      : JSON.stringify(req.body);

  console.log("Raw Body Length:", rawBody.length);
  console.log("Raw Body Preview:", rawBody.substring(0, 200) + "...");

  let parsedBody: any;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch (e) {
    parsedBody = req.body;
  }

  console.log("✅ Body parsed successfully");

  let gatewayType: PaymentGatewayType = PaymentGatewayType.RAZORPAY;
  if (req.headers["x-razorpay-signature"]) {
    gatewayType = PaymentGatewayType.RAZORPAY;
  }

  console.log("✅ Gateway detected:", gatewayType);

  let signature = "";
  if (gatewayType === PaymentGatewayType.RAZORPAY) {
    signature = req.headers["x-razorpay-signature"] as string;
  }

  try {
    const gateway: IPaymentGateway =
      PaymentGatewayFactory.getGatewayByType(gatewayType);

    let isValid = false;
    if (signature) {
      try {
        isValid = await gateway.verifyWebhookSignature(rawBody, signature);
        console.log(
          "✅ Signature verification:",
          isValid ? "PASSED" : "FAILED",
        );
      } catch (sigError: any) {
        console.error("❌ Signature verification error:", sigError.message);
        if (process.env.NODE_ENV === "development") {
          console.log("⚠️ Development mode: Allowing despite signature error");
          isValid = true;
        }
      }
    } else {
      if (process.env.NODE_ENV === "development") {
        console.log("⚠️ Development mode: No signature, allowing");
        isValid = true;
      }
    }

    if (!isValid) {
      console.error("❌ Invalid webhook signature");
      return res
        .status(401)
        .json({ success: false, error: "Invalid signature" });
    }

    const normalizedEvent = await gateway.parseWebhookEvent(parsedBody);
    console.log("✅ Webhook parsed:", normalizedEvent.eventType);
    console.log("✅ Event ID:", normalizedEvent.gatewayEventId);
    console.log("✅ Payment Intent ID:", normalizedEvent.paymentIntentId);
    console.log("✅ Transaction ID:", normalizedEvent.transactionId);
    console.log("✅ Internal Order ID:", normalizedEvent.internalOrderId);

    if (!normalizedEvent.gatewayEventId) {
      normalizedEvent.gatewayEventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // ✅ Process webhook with retry - NO TRANSACTION
    await retryWithBackoff(async () => {
      await processWebhookEventWithoutTransaction(normalizedEvent);
    });

    console.log("✅ Webhook processed successfully");
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("❌ Webhook processing error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Webhook processing failed",
    });
  }
};

// ✅ Process webhook WITHOUT transaction (to avoid write conflicts)
async function processWebhookEventWithoutTransaction(event: any) {
  console.log("🔄 Processing webhook event:", event.eventType);

  let order = null;

  // ✅ Try multiple ways to find order
  if (event.paymentIntentId) {
    order = await Order.findOne({
      paymentIntentId: event.paymentIntentId,
    });
    if (order) {
      console.log("✅ Order found by paymentIntentId:", event.paymentIntentId);
    }
  }

  if (!order && event.internalOrderId) {
    order = await Order.findOne({
      orderId: event.internalOrderId,
    });
    if (order) {
      console.log("✅ Order found by internal orderId:", event.internalOrderId);
    }
  }

  if (!order && event.transactionId) {
    order = await Order.findOne({
      "paymentAttempts.paymentIntentId": event.transactionId,
    });
    if (order) {
      console.log("✅ Order found by transactionId:", event.transactionId);
    }
  }

  if (!order && event.orderId) {
    order = await Order.findOne({
      paymentIntentId: event.orderId,
    });
    if (order) {
      console.log("✅ Order found by orderId (Razorpay):", event.orderId);
    }
  }

  if (!order) {
    console.error("❌ Order not found for payment:", event.paymentIntentId);
    return;
  }

  console.log(`📦 Processing webhook for order ${order.orderId}`);

  // ✅ Check if already processed
  if (
    order.paymentStatus === "captured" ||
    order.paymentStatus === "refunded"
  ) {
    console.log(
      `⚠️ Order ${order.orderId} already ${order.paymentStatus}, skipping`,
    );
    return;
  }

  switch (event.eventType) {
    case "payment.captured":
    case "payment.succeeded":
      await handlePaymentCapturedNoTransaction(order, event);
      break;
    case "payment.authorized":
      await handlePaymentAuthorizedNoTransaction(order, event);
      break;
    case "payment.failed":
      await handlePaymentFailedNoTransaction(order, event);
      break;
    case "payment.refunded":
    case "payment.partially_refunded":
      await handlePaymentRefundedNoTransaction(order, event);
      break;
    default:
      console.log("⚠️ Unhandled webhook event type:", event.eventType);
  }
}

// ✅ NO TRANSACTION versions
async function handlePaymentCapturedNoTransaction(order: any, event: any) {
  console.log(`💰 Handling payment captured for order ${order.orderId}`);

  // ✅ Use findOneAndUpdate with condition to avoid duplicate updates
  const result = await Order.findOneAndUpdate(
    {
      _id: order._id,
      paymentStatus: { $ne: "captured" },
    },
    {
      $set: {
        status: "captured",
        paymentStatus: "captured",
        paidAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );

  if (!result) {
    console.log(`⚠️ Order ${order.orderId} already captured or not found`);
    return;
  }

  // ✅ Update checkout session
  await CheckoutSession.findOneAndUpdate(
    { orderId: order._id },
    {
      $set: {
        status: "completed",
        completedAt: new Date(),
      },
    },
  );

  // ✅ Create transaction record
  const transaction = new Transaction({
    transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    transactionType: "payment",
    status: "captured",
    amount: event.amount || result.finalAmount,
    currency: event.currency || "INR",
    gateway: event.gatewayType || "razorpay",
    gatewayTransactionId: event.transactionId || event.paymentIntentId,
    gatewayOrderId: event.orderId || result.orderId,
    gatewayPaymentId: event.paymentIntentId,
    orderId: result._id,
    orderNumber: result.orderId,
    userId: result.buyerId,
    payerName: result.buyerName,
    receiverName: "TizzyGo",
    receiverAccountId: result.zeptPayAccountId,
    rawResponse: event.rawPayload || event,
    completedAt: new Date(),
  });

  await transaction.save();

  // ✅ Update order with transaction reference
  await Order.findOneAndUpdate(
    { _id: result._id },
    { $set: { transactionId: transaction._id } },
  );

  console.log(`✅ Payment captured for ${result.orderId}`);
  console.log(`✅ Transaction created: ${transaction.transactionId}`);
}

async function handlePaymentAuthorizedNoTransaction(order: any, event: any) {
  console.log(`🔐 Payment authorized for order ${order.orderId}`);

  await Order.findOneAndUpdate(
    { _id: order._id },
    {
      $set: {
        status: "authorized",
        paymentStatus: "authorized",
      },
    },
  );

  await CheckoutSession.findOneAndUpdate(
    { orderId: order._id },
    { $set: { status: "authorized" } },
  );

  console.log(`✅ Payment authorized for ${order.orderId}`);
}

async function handlePaymentFailedNoTransaction(order: any, event: any) {
  console.log(`❌ Payment failed for order ${order.orderId}`);

  await Order.findOneAndUpdate(
    { _id: order._id },
    {
      $set: {
        status: "failed",
        paymentStatus: "failed",
      },
    },
  );

  await CheckoutSession.findOneAndUpdate(
    { orderId: order._id },
    {
      $set: {
        status: "failed",
        failedAt: new Date(),
      },
    },
  );

  console.log(`❌ Payment failed for ${order.orderId}`);
}

async function handlePaymentRefundedNoTransaction(order: any, event: any) {
  console.log(`↩️ Payment refunded for order ${order.orderId}`);

  await Order.findOneAndUpdate(
    { _id: order._id },
    {
      $set: {
        status: "refunded",
        paymentStatus: "refunded",
        refundedAt: new Date(),
      },
    },
  );

  await CheckoutSession.findOneAndUpdate(
    { orderId: order._id },
    { $set: { status: "refunded", refundedAt: new Date() } },
  );

  const transaction = new Transaction({
    transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    transactionType: "refund",
    status: "refunded",
    amount: event.amount,
    currency: event.currency || "INR",
    gateway: event.gatewayType || "razorpay",
    gatewayTransactionId: event.transactionId || event.paymentIntentId,
    gatewayOrderId: event.orderId || order.orderId,
    gatewayPaymentId: event.paymentIntentId,
    orderId: order._id,
    orderNumber: order.orderId,
    userId: order.buyerId,
    payerName: order.buyerName,
    receiverName: "TizzyGo",
    receiverAccountId: order.zeptPayAccountId,
    rawResponse: event.rawPayload || event,
    completedAt: new Date(),
  });

  await transaction.save({ session });
  console.log(`✅ Payment refunded for ${order.orderId}`);
}
