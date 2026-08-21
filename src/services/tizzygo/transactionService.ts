import mongoose from "mongoose";
import Razorpay from "razorpay";
import crypto from "crypto";
import CheckoutSession from "../../models/tizzygo/checkout/CheckoutSession";
import Order from "../../models/tizzygo/checkout/order";
import User from "../../models/tizzygo/auths/User";
import Transaction from "../../models/tizzygo/checkout/Transaction";
import {
  generateOrderId,
  generateToken,
  generateQrCodeDataUrl,
} from "../../utils/tizzygo/paymentHelpers";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

interface ProcessPaymentParams {
  checkoutSessionId: string;
  paymentType: string;
  userId: string;
  user: any;
  transactionId?: string;
  frequency?: string;
  startDate?: Date;
  endDate?: Date | null;
  session: mongoose.ClientSession;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
}

/**
 * ✅ processPayment - ONLY verifies Razorpay signature
 *
 * CRITICAL: This function does NOT update Orders, Transactions, CheckoutSession, or Cart.
 * Webhook is the ONLY source of truth for updates.
 *
 * This function:
 * 1. Validates the request
 * 2. Verifies Razorpay signature
 * 3. Returns success/failure
 *
 * DO NOT add update logic here.
 * DO NOT clear cart here.
 * DO NOT update order status here.
 */
export const processPayment = async ({
  checkoutSessionId,
  paymentType,
  userId,
  user,
  transactionId,
  frequency,
  startDate,
  endDate,
  session,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}: ProcessPaymentParams) => {
  console.log("========================================");
  console.log("💳 [transactionService] processPayment STARTED");
  console.log("========================================");
  console.log(`📋 CheckoutSession ID: ${checkoutSessionId}`);
  console.log(`👤 User ID: ${userId}`);
  console.log(`💳 Payment Type: ${paymentType}`);
  console.log(`🔑 Razorpay Order ID: ${razorpayOrderId || "Not provided"}`);
  console.log(`🔑 Razorpay Payment ID: ${razorpayPaymentId || "Not provided"}`);
  console.log(
    `🔑 Signature: ${razorpaySignature ? "PROVIDED" : "NOT PROVIDED"}`,
  );

  // ✅ Find checkout session (read-only)
  const checkoutSession = await CheckoutSession.findOne({
    checkoutSessionId,
    userId,
  }).session(session);

  if (!checkoutSession) {
    throw new Error(`Checkout session not found: ${checkoutSessionId}`);
  }

  if (
    checkoutSession.expiresAt &&
    new Date() > new Date(checkoutSession.expiresAt)
  ) {
    throw new Error("Checkout session expired");
  }

  // ✅ Extract data from CheckoutSession snapshot
  const cartSnapshot = checkoutSession.cartSnapshot || {};
  const items = cartSnapshot?.items || [];
  const calculatedData = cartSnapshot?.calculatedData || {};

  if (items.length === 0) {
    throw new Error("No items in checkout session");
  }

  const amount = calculatedData.finalAmount || 0;

  if (!amount || amount <= 0) {
    throw new Error(`Invalid payment amount: ${amount}`);
  }

  // ✅ Check for existing Razorpay order
  let razorpayOrderIdToUse = checkoutSession.paymentIntentId || razorpayOrderId;

  // ✅ If no Razorpay order ID exists, create one
  if (!razorpayOrderIdToUse && paymentType === "normal") {
    console.log("💳 Creating Razorpay Order...");
    try {
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
        notes: {
          checkoutSessionId: checkoutSessionId,
          buyerId: userId,
          transactionId: transactionId || "",
          itemCount: items.length,
          isBuyNow: checkoutSession.metadata?.isBuyNow ? "true" : "false",
        },
      });
      razorpayOrderIdToUse = razorpayOrder.id;

      // ✅ ONLY update paymentIntentId in CheckoutSession
      // This is the ONLY write operation in this function
      checkoutSession.paymentIntentId = razorpayOrderIdToUse;
      await checkoutSession.save({ session });
      console.log(`✅ Razorpay Order Created: ${razorpayOrderIdToUse}`);
    } catch (sdkError: any) {
      console.error("❌ RAZORPAY SDK ERROR:", sdkError.message);
      throw new Error(
        `Payment gateway failed: ${sdkError?.message || "Unknown SDK error"}`,
      );
    }
  }

  // ✅ ✅ ✅ VERIFY RAZORPAY SIGNATURE ✅ ✅ ✅
  let isSignatureValid = false;
  let signatureError = null;

  if (razorpayPaymentId && razorpaySignature && razorpayOrderIdToUse) {
    console.log("🔐 Verifying Razorpay signature...");
    console.log(`  - order_id: ${razorpayOrderIdToUse}`);
    console.log(`  - payment_id: ${razorpayPaymentId}`);
    console.log(`  - signature: ${razorpaySignature}`);

    try {
      const secret = process.env.RAZORPAY_KEY_SECRET || "";
      const generatedSignature = crypto
        .createHmac("sha256", secret)
        .update(`${razorpayOrderIdToUse}|${razorpayPaymentId}`)
        .digest("hex");

      isSignatureValid = generatedSignature === razorpaySignature;

      if (isSignatureValid) {
        console.log("✅ Signature verification PASSED");
      } else {
        console.error("❌ Signature verification FAILED");
        console.error(`  Generated: ${generatedSignature}`);
        console.error(`  Received: ${razorpaySignature}`);
        signatureError = "Invalid payment signature";
      }
    } catch (error: any) {
      console.error("❌ Signature verification error:", error.message);
      signatureError = error.message;
    }
  } else {
    console.log("⚠️ No signature provided for verification");
    if (paymentType !== "cod" && process.env.NODE_ENV === "production") {
      signatureError = "Payment signature required for verification";
    }
  }

  // ✅ ✅ ✅ DO NOT UPDATE ORDERS, TRANSACTIONS, OR CART HERE ✅ ✅ ✅
  // Webhook is the ONLY source of truth for these updates
  // This prevents WriteConflict (code 112) errors

  console.log(
    `✅ Signature verification result: ${isSignatureValid ? "VALID" : "INVALID"}`,
  );
  console.log(`ℹ️ Webhook will handle all status updates`);

  return {
    checkoutSession,
    razorpayResponse: {
      orderId: razorpayOrderIdToUse,
      paymentId: razorpayPaymentId,
      status: isSignatureValid ? "verified" : "failed",
    },
    paymentIntentId: razorpayOrderIdToUse || checkoutSession.paymentIntentId,
    paymentStatus: isSignatureValid ? "verified" : "failed",
    amount,
    isSignatureValid,
    message: isSignatureValid
      ? "Signature verified. Waiting for webhook confirmation."
      : "Signature verification failed.",
  };
};

export const getOrderStatus = async (orderId: string, userId: string) => {
  const order = await Order.findOne({
    orderId,
    buyerId: userId,
  }).lean();

  if (!order) {
    throw new Error("Order not found");
  }

  return order;
};
