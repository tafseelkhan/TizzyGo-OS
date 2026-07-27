// services/tizzygo/transactionService.ts - RAZORPAY VERSION
import mongoose from "mongoose";
import Razorpay from "razorpay";
import CheckoutSession from "../../models/tizzygo/checkout/CheckoutSession";
import Order from "../../models/tizzygo/checkout/order";
import User from "../../models/tizzygo/auths/User";
import {
  normalizePaymentIntentId,
  getPaymentStatus,
  createPaymentAttempt,
  extractPaymentAmount,
  PaymentStatus,
} from "../../utils/tizzygo/transactionHelpers";

// ✅ Initialize Razorpay
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
  const appName = productData?.appName || "TizzyGo";

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
  checkoutSession.paymentGateway = "razorpay"; // ✅ Razorpay

  await order.save({ session });
  await checkoutSession.save({ session });

  // ✅ Call Razorpay SDK
  let razorpayResponse: any = {};

  try {
    console.log("========================================");
    console.log("🚀 BEFORE RAZORPAY SDK CALL");
    console.log("========================================");
    console.log("Payment Type:", paymentType);
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

    // ✅ Razorpay Order Create (if not already created)
    if (paymentType === "normal") {
      console.log("💳 Calling Razorpay orders.create()...");

      // Check if order already has razorpay order ID
      let razorpayOrderId = order.paymentIntentId;

      if (!razorpayOrderId) {
        // Create new Razorpay order
        const razorpayOrder = await razorpay.orders.create({
          amount: Math.round(amount * 100), // paise mein
          currency: "INR",
          receipt: `receipt_${Date.now()}`,
          notes: {
            checkoutSessionId: checkoutSessionId,
            orderId: order.orderId,
            buyerId: userId,
            transactionId: transactionId || "",
          },
        });
        razorpayOrderId = razorpayOrder.id;
        order.paymentIntentId = razorpayOrderId;
        checkoutSession.paymentIntentId = razorpayOrderId;
        await order.save({ session });
        await checkoutSession.save({ session });
        console.log(`✅ Razorpay Order Created: ${razorpayOrderId}`);
      }

      razorpayResponse = {
        paymentIntentId: razorpayOrderId,
        status: "created",
        orderId: order.orderId,
        amount: amount,
        currency: "INR",
      };

      console.log(`✅ Razorpay order prepared (${Date.now() - sdkStart}ms)`);
    } else if (paymentType === "qr") {
      console.log("📱 QR payment not supported in Razorpay currently");
      throw new Error("QR payment type not supported in Razorpay");
    } else if (paymentType === "autopay") {
      console.log("🔄 Autopay not supported in Razorpay currently");
      throw new Error("Autopay not supported in Razorpay");
    }

    console.log("========================================");
    console.log("📦 RAZORPAY RESPONSE");
    console.log("========================================");
    console.log(JSON.stringify(razorpayResponse, null, 2));
  } catch (sdkError: any) {
    console.log("========================================");
    console.log("❌ RAZORPAY SDK ERROR");
    console.log("========================================");
    console.log("Message:", sdkError?.message);
    console.log("Code:", sdkError?.code);
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
  const paymentIntentId = normalizePaymentIntentId(razorpayResponse);
  const paymentStatus = getPaymentStatus(razorpayResponse);

  const paymentAttempt = createPaymentAttempt(
    paymentIntentId,
    paymentType,
    paymentStatus,
    { ...razorpayResponse, transactionId },
  );

  if (!order.paymentAttempts) order.paymentAttempts = [];
  order.paymentAttempts.push(paymentAttempt);

  if (paymentIntentId) {
    order.paymentIntentId = paymentIntentId;
    checkoutSession.paymentIntentId = paymentIntentId;
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
    razorpayResponse,
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
