import mongoose from "mongoose";
import { ZeptPay } from "@flixora/zeptpay-payment-core";
import CheckoutSession from "../../models/tizzygo/checkout/CheckoutSession";
import Order from "../../models/tizzygo/order/order";
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

  const payer = {
    userId: user.userId,
    name: user.name || "Customer",
    email: user.email || "",
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
    if (paymentType === "normal") {
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
    } else if (paymentType === "qr") {
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
    } else if (paymentType === "autopay") {
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
    }
  } catch (sdkError: any) {
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
