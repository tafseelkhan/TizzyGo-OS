import mongoose from "mongoose";
import { ZeptPay } from "@flixora/zeptpay-payment-core";
import CheckoutSession from "../../models/tizzygo/checkout/CheckoutSession";
import Order from "../../models/tizzyos/shipping/order/order";
import User from "../../models/tizzygo/auths/User";
import {
  normalizePaymentIntentId,
  getPaymentStatus,
  createPaymentAttempt,
  extractPaymentAmount,
  PaymentStatus,
} from "../../utils/tizzygo/transactionHelpers";

const zeptpay = new ZeptPay({
  clientKey: process.env.ZEPTPAY_CLIENT_KEY!,
  secretKey: process.env.ZEPTPAY_SECRET_KEY!,
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
}

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
}: ProcessPaymentParams) => {
  // Find checkout session
  const checkoutSession: any = await CheckoutSession.findOne({
    checkoutSessionId,
    userId,
  }).session(session);

  if (!checkoutSession) {
    throw new Error("Checkout session not found");
  }

  // Find order
  const order: any = await Order.findById(checkoutSession.orderId).session(
    session,
  );
  if (!order) {
    throw new Error("Order not found");
  }

  // Prevent duplicate payment
  if (["captured", "authorized"].includes(order.paymentStatus)) {
    throw new Error("Order already paid");
  }

  // Check if session expired
  if (
    checkoutSession.expiresAt &&
    new Date() > new Date(checkoutSession.expiresAt)
  ) {
    checkoutSession.status = "expired";
    order.status = "cancelled";
    order.paymentStatus = "failed";

    await checkoutSession.save({ session });
    await order.save({ session });

    throw new Error("Checkout session expired");
  }

  // Extract data for payment
  const cartSnapshot = checkoutSession.cartSnapshot || {};
  const firstItem = cartSnapshot?.items?.[0] || {};
  const productData = firstItem?.productData || {};
  const calculatedData =
    firstItem?.calculated || cartSnapshot?.calculatedData || {};

  const amount = extractPaymentAmount(calculatedData);
  const vendorCodeUID = productData?.vendorCodeUID;
  const appName = productData?.appName || "TizzyGo";

  if (!vendorCodeUID) {
    throw new Error("vendorCodeUID missing");
  }

  if (!amount || amount <= 0) {
    throw new Error("Invalid payment amount");
  }

  const userAccount = await User.findById(userId).select("name email");

  if (!userAccount) {
    throw new Error("User not found");
  }
  const payer = {
    userId: user.userId,
    name: userAccount.name || "Customer",
    email: userAccount.email || "",
  };

  // Update statuses
  order.status = "processing";
  order.paymentStatus = "processing";
  checkoutSession.status = "processing";
  checkoutSession.paymentGateway = "zeptpay";

  await order.save({ session });
  await checkoutSession.save({ session });

  // Call ZeptPay SDK
  let zeptpayResponse: any = {};

  try {
    console.log("========================================");
    console.log("🚀 BEFORE ZEPTPAY SDK CALL");
    console.log("========================================");
    console.log("Payment Type:", paymentType);
    console.log("Vendor Code:", vendorCodeUID);
    console.log("Amount:", amount);
    console.log("Currency:", "INR");
    console.log("App Name:", appName);
    console.log("Payer:", JSON.stringify(payer, null, 2));
    console.log(
      "Meta:",
      JSON.stringify(
        {
          checkoutSessionId,
          orderId: order.orderId,
          buyerId: userId,
          transactionId,
        },
        null,
        2,
      ),
    );

    const sdkStart = Date.now();

    if (paymentType === "normal") {
      console.log("💳 Calling createPayment()...");

      zeptpayResponse = await zeptpay.flixora.payments.createPayment({
        vendorCodeUID,
        amount,
        currency: "INR",
        appName,
        payer,
        meta: {
          checkoutSessionId,
          orderId: order.orderId,
          buyerId: userId,
          transactionId,
        },
      } as any);

      console.log(`✅ createPayment SUCCESS (${Date.now() - sdkStart}ms)`);
    } else if (paymentType === "qr") {
      console.log("📱 Calling generateTestQR()...");

      zeptpayResponse = await zeptpay.flixora.qr.generateTestQR({
        vendorCodeUID,
        amount,
        currency: "INR",
        appName,
        payer,
        meta: {
          checkoutSessionId,
          orderId: order.orderId,
          buyerId: userId,
          transactionId,
        },
      } as any);

      console.log(`✅ generateTestQR SUCCESS (${Date.now() - sdkStart}ms)`);
    } else if (paymentType === "autopay") {
      console.log("🔄 Calling createAutoPayTransaction()...");

      zeptpayResponse = await zeptpay.flixora.autopay.createAutoPayTransaction({
        vendorCodeUID,
        amount,
        currency: "INR",
        appName,
        payer,
        frequency: frequency || "monthly",
        startDate: startDate || new Date(),
        endDate: endDate || null,
        meta: {
          checkoutSessionId,
          orderId: order.orderId,
          buyerId: userId,
          transactionId,
        },
      } as any);

      console.log(
        `✅ createAutoPayTransaction SUCCESS (${Date.now() - sdkStart}ms)`,
      );
    }

    console.log("========================================");
    console.log("📦 ZEPTPAY RESPONSE");
    console.log("========================================");
    console.log(JSON.stringify(zeptpayResponse, null, 2));
  } catch (sdkError: any) {
    console.log("========================================");
    console.log("❌ ZEPTPAY SDK ERROR");
    console.log("========================================");
    console.log("Message:", sdkError?.message);
    console.log("Name:", sdkError?.name);
    console.log("Code:", sdkError?.code);
    console.log("Status:", sdkError?.status);
    console.log("Response:", sdkError?.response);
    console.log("Stack:", sdkError?.stack);

    order.status = "failed";
    order.paymentStatus = "failed";
    checkoutSession.status = "failed";

    await order.save({ session });
    await checkoutSession.save({ session });

    throw new Error(
      `Payment gateway failed: ${sdkError?.message || "Unknown SDK error"}`,
    );
  }

  // Process response
  const paymentIntentId = normalizePaymentIntentId(zeptpayResponse);
  const paymentStatus = getPaymentStatus(zeptpayResponse);

  const paymentAttempt = createPaymentAttempt(
    paymentIntentId,
    paymentType,
    paymentStatus,
    { ...zeptpayResponse, transactionId },
  );

  if (!order.paymentAttempts) order.paymentAttempts = [];
  order.paymentAttempts.push(paymentAttempt);

  if (paymentIntentId) {
    order.paymentIntentId = paymentIntentId;
    checkoutSession.paymentIntentId = paymentIntentId;
  }

  if (zeptpayResponse?.qrCodeId) {
    checkoutSession.qrCodeId = zeptpayResponse.qrCodeId;
  }

  // Update status based on payment result
  switch (paymentStatus) {
    case "captured":
      order.status = "captured";
      order.paymentStatus = "captured";
      checkoutSession.status = "completed";
      break;
    case "authorized":
      order.status = "authorized";
      order.paymentStatus = "authorized";
      checkoutSession.status = "authorized";
      break;
    case "failed":
      order.status = "failed";
      order.paymentStatus = "failed";
      checkoutSession.status = "failed";
      break;
    case "cancelled":
      order.status = "cancelled";
      order.paymentStatus = "failed";
      checkoutSession.status = "cancelled";
      break;
    default:
      order.status = "processing";
      order.paymentStatus = "processing";
      checkoutSession.status = "processing";
  }

  await order.save({ session });
  await checkoutSession.save({ session });

  return {
    order,
    checkoutSession,
    zeptpayResponse,
    paymentIntentId,
    paymentStatus,
    amount,
    appName,
    payer,
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
