import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import { processPayment } from "../../../services/tizzygo/transactionService";
import { validatePaymentRequest } from "../../../utils/tizzygo/transactionHelpers";
import CheckoutSession from "../../../models/tizzygo/checkout/CheckoutSession";

export const processPaymentHandler = async (
  req: AuthRequest,
  res: Response,
) => {
  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    const user = req.user;
    const {
      checkoutSessionId,
      paymentType = "normal",
      transactionId,
      frequency,
      startDate,
      endDate,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    console.log("========================================");
    console.log("💳 PROCESS PAYMENT HANDLER CALLED");
    console.log("========================================");
    console.log(`📋 CheckoutSession ID: ${checkoutSessionId}`);
    console.log(`👤 User ID: ${user?.userId}`);
    console.log(`💳 Payment Type: ${paymentType}`);
    console.log(`🔑 Razorpay Order ID: ${razorpay_order_id || "NOT PROVIDED"}`);
    console.log(
      `🔑 Razorpay Payment ID: ${razorpay_payment_id || "NOT PROVIDED"}`,
    );
    console.log(
      `🔑 Signature: ${razorpay_signature ? "PROVIDED" : "NOT PROVIDED"}`,
    );

    // ✅ Validate request
    const validationError = validatePaymentRequest(
      user?.userId,
      checkoutSessionId,
      paymentType,
    );

    if (validationError) {
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(401).json({ success: false, error: validationError });
    }

    // ✅ ✅ ✅ STRICT VALIDATION FOR ONLINE PAYMENTS ✅ ✅ ✅
    if (paymentType !== "cod") {
      if (!razorpay_order_id) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        return res.status(400).json({
          success: false,
          error: "Razorpay order_id is required",
          code: "MISSING_RAZORPAY_ORDER_ID",
        });
      }

      if (!razorpay_payment_id) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        return res.status(400).json({
          success: false,
          error: "Razorpay payment_id is required",
          code: "MISSING_RAZORPAY_PAYMENT_ID",
        });
      }

      if (!razorpay_signature) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        return res.status(400).json({
          success: false,
          error: "Razorpay signature is required",
          code: "MISSING_RAZORPAY_SIGNATURE",
        });
      }

      console.log("✅ All required Razorpay fields present");
    }

    // ✅ Process payment - ONLY verifies signature
    // Does NOT update Orders, Transactions, or Cart
    const result = await processPayment({
      checkoutSessionId,
      paymentType,
      userId: user!.userId,
      user,
      transactionId: transactionId || razorpay_payment_id,
      frequency,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : null,
      session: mongoSession,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    const isSignatureValid = (result as any).isSignatureValid || false;

    // ✅ ✅ ✅ DO NOT UPDATE ORDERS HERE ✅ ✅ ✅
    // Webhook will handle all status updates
    // This prevents WriteConflict (code 112)

    return res.status(200).json({
      success: isSignatureValid,
      message: isSignatureValid
        ? "Signature verified. Webhook will confirm payment."
        : "Signature verification failed.",
      checkoutSessionId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      isSignatureValid,
      // ✅ Tell frontend to wait for webhook
      status: isSignatureValid
        ? "verification_successful"
        : "verification_failed",
      nextStep: isSignatureValid
        ? "Waiting for Razorpay webhook confirmation. Check order status shortly."
        : "Payment verification failed. Please try again.",
    });
  } catch (err: any) {
    await mongoSession.abortTransaction();
    mongoSession.endSession();

    console.error("💥 PROCESS PAYMENT ERROR:", err);

    let statusCode = 500;
    let errorMessage = err.message;

    if (errorMessage.includes("not found")) statusCode = 404;
    else if (errorMessage.includes("already paid")) statusCode = 400;
    else if (errorMessage.includes("expired")) statusCode = 400;
    else if (errorMessage.includes("missing")) statusCode = 400;
    else if (errorMessage.includes("Invalid")) statusCode = 400;
    else if (errorMessage.includes("signature")) statusCode = 400;

    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: err?.message || "Something went wrong",
    });
  }
};

export const getOrderStatusHandler = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { orderId } = req.params;
    const user = req.user;

    if (!user?.userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const orderResult = await getOrderStatus(orderId, user.userId);
    const order = Array.isArray(orderResult) ? orderResult[0] : orderResult;

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    return res.status(200).json({
      success: true,
      order: {
        _id: order._id,
        orderId: order.orderId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentIntentId: order.paymentIntentId,
        finalAmount: order.finalAmount,
        productTitle: order.productTitle || null,
        paymentAttempts:
          order.paymentAttempts?.map((attempt: any) => ({
            paymentIntentId: attempt.paymentIntentId,
            method: attempt.method,
            status: attempt.status,
            createdAt: attempt.createdAt,
          })) || [],
        lastAttempt:
          order.paymentAttempts?.[order.paymentAttempts.length - 1] || null,
      },
    });
  } catch (err: any) {
    console.error("💥 ORDER STATUS ERROR:", err);

    if (err.message === "Order not found") {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

async function getOrderStatus(orderId: string, userId: any) {
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  if (!userId) {
    throw new Error("User ID is required");
  }

  const OrderModel =
    mongoose.models.Order ||
    mongoose.model(
      "Order",
      new mongoose.Schema({}, { strict: false, collection: "orders" }),
    );

  const orderQuery: any = {
    $and: [
      {
        $or: [
          { orderId },
          { orderID: orderId },
          ...(mongoose.Types.ObjectId.isValid(orderId)
            ? [{ _id: new mongoose.Types.ObjectId(orderId) }]
            : []),
        ],
      },
      {
        $or: [
          { userId },
          { user: userId },
          { customerId: userId },
          { customer: userId },
          { userId: userId.toString() },
        ],
      },
    ],
  };

  return OrderModel.findOne(orderQuery).lean();
}
