import { Request, Response } from "express";
import mongoose from "mongoose";
import { PaymentGatewayFactory } from "../../../factories/PaymentGatewayFactory";
import {
  PaymentGatewayType,
  WebhookEventType,
} from "../../../enums/PaymentGatewayType";
import Order from "../../../models/tizzygo/checkout/order";
import CheckoutSession from "../../../models/tizzygo/checkout/CheckoutSession";
import WebhookEvent from "../../../models/tizzygo/checkout/WebhookEvent";
import { generateCheckoutSessionId } from "../../../utils/tizzygo/paymentHelpers";

export const webhookHandler = async (req: Request, res: Response) => {
  console.log("========================================");
  console.log("🔔 WEBHOOK RECEIVED");
  console.log("========================================");
  console.log("Gateway:", req.params.gateway);
  console.log("Headers:", req.headers);
  console.log("Body:", JSON.stringify(req.body, null, 2));

  const gatewayType = req.params.gateway as PaymentGatewayType;
  const signature =
    (req.headers["x-razorpay-signature"] as string) ||
    (req.headers["x-zeptpay-signature"] as string);

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    // Get gateway
    const gateway = PaymentGatewayFactory.getGatewayByType(gatewayType);

    // Verify webhook signature
    const payload = JSON.stringify(req.body);
    const isValid = await gateway.verifyWebhookSignature(payload, signature);

    if (!isValid) {
      console.error("❌ Invalid webhook signature");
      await mongoSession.abortTransaction();
      return res
        .status(401)
        .json({ success: false, error: "Invalid signature" });
    }

    // Parse webhook event
    const normalizedEvent = await gateway.parseWebhookEvent(req.body);
    console.log("✅ Webhook parsed:", normalizedEvent);

    // Check for duplicate webhook
    const existingWebhook = await WebhookEvent.findOne({
      gateway: gatewayType,
      gatewayEventId: normalizedEvent.gatewayEventId,
    }).session(mongoSession);

    if (existingWebhook) {
      console.log("⚠️ Duplicate webhook event, ignoring");
      await mongoSession.commitTransaction();
      return res
        .status(200)
        .json({ success: true, message: "Duplicate webhook ignored" });
    }

    // Create webhook event record
    const webhookEvent = new WebhookEvent({
      webhookEventId: generateCheckoutSessionId(),
      gateway: gatewayType,
      gatewayEventId: normalizedEvent.gatewayEventId,
      eventType: normalizedEvent.eventType,
      status: "pending",
      payload: req.body,
      retryCount: 0,
    });

    await webhookEvent.save({ session: mongoSession });

    // Process webhook event
    await processWebhookEvent(normalizedEvent, mongoSession);

    // Mark webhook as processed
    webhookEvent.status = "processed";
    webhookEvent.processedAt = new Date();
    await webhookEvent.save({ session: mongoSession });

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    console.log("✅ Webhook processed successfully");
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("❌ Webhook processing error:", error);
    await mongoSession.abortTransaction();
    mongoSession.endSession();

    return res.status(500).json({
      success: false,
      error: error.message || "Webhook processing failed",
    });
  }
};

// Normalized webhook event shape used throughout this controller
type NormalizedWebhookEvent = {
  gatewayEventId: string;
  eventType: WebhookEventType;
  paymentIntentId?: string;
  payload?: any;
  amount?: number;
};

async function processWebhookEvent(
  event: NormalizedWebhookEvent,
  session: mongoose.ClientSession,
) {
  console.log("🔄 Processing webhook event:", event.eventType);

  switch (event.eventType) {
    case WebhookEventType.PAYMENT_CAPTURED:
      await handlePaymentCaptured(event, session);
      break;
    case WebhookEventType.PAYMENT_AUTHORIZED:
      await handlePaymentAuthorized(event, session);
      break;
    case WebhookEventType.PAYMENT_FAILED:
      await handlePaymentFailed(event, session);
      break;
    case WebhookEventType.PAYMENT_REFUNDED:
      await handlePaymentRefunded(event, session);
      break;
    default:
      console.log("⚠️ Unhandled webhook event type:", event.eventType);
  }
}

async function handlePaymentCaptured(
  event: NormalizedWebhookEvent,
  session: mongoose.ClientSession,
) {
  // Find order by payment intent ID
  const order = await Order.findOne({
    paymentIntentId: event.paymentIntentId,
  }).session(session);

  if (!order) {
    console.error("❌ Order not found for payment:", event.paymentIntentId);
    return;
  }

  // Update order
  order.status = "captured";
  order.paymentStatus = "captured";

  // Update checkout session
  const checkoutSession = await CheckoutSession.findOne({
    orderId: order._id,
  }).session(session);

  if (checkoutSession) {
    checkoutSession.status = "completed";
    await checkoutSession.save({ session });
  }

  await order.save({ session });
  console.log("✅ Order updated:", order.orderId);
}

async function handlePaymentAuthorized(
  event: NormalizedWebhookEvent,
  session: mongoose.ClientSession,
) {
  const order = await Order.findOne({
    paymentIntentId: event.paymentIntentId,
  }).session(session);

  if (!order) {
    console.error("❌ Order not found for payment:", event.paymentIntentId);
    return;
  }

  order.status = "authorized";
  order.paymentStatus = "authorized";
  await order.save({ session });
  console.log("✅ Order authorized:", order.orderId);
}

async function handlePaymentFailed(
  event: NormalizedWebhookEvent,
  session: mongoose.ClientSession,
) {
  const order = await Order.findOne({
    paymentIntentId: event.paymentIntentId,
  }).session(session);

  if (!order) {
    console.error("❌ Order not found for payment:", event.paymentIntentId);
    return;
  }

  order.status = "failed";
  order.paymentStatus = "failed";

  const checkoutSession = await CheckoutSession.findOne({
    orderId: order._id,
  }).session(session);

  if (checkoutSession) {
    checkoutSession.status = "failed";
    await checkoutSession.save({ session });
  }

  await order.save({ session });
  console.log("✅ Order failed:", order.orderId);
}

async function handlePaymentRefunded(
  event: NormalizedWebhookEvent,
  session: mongoose.ClientSession,
) {
  const order = await Order.findOne({
    paymentIntentId: event.paymentIntentId,
  }).session(session);

  if (!order) {
    console.error("❌ Order not found for refund:", event.paymentIntentId);
    return;
  }

  order.status = "refunded";
  order.paymentStatus = "refunded";
  await order.save({ session });
  console.log("✅ Order refunded:", order.orderId);
}
