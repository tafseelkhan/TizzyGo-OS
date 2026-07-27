// controllers/tizzygo/paymentController.ts - FINAL FIXED VERSION

import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import { createPaymentIntent } from "../../../services/tizzygo/paymentService";
import CheckoutSession, {
  ICheckoutSession,
} from "../../../models/tizzygo/checkout/CheckoutSession";
import Order from "../../../models/tizzygo/checkout/order";

export const createPaymentIntentHandler = async (
  req: AuthRequest,
  res: Response,
) => {
  console.log("========================================");
  console.log("🚀 CREATE PAYMENT INTENT HANDLER CALLED");
  console.log("========================================");

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    const user = req.user;
    const { address, paymentMethod = "online", idempotencyKey } = req.body;

    console.log("📥 Request received:");
    console.log("  - User ID:", user?.userId);
    console.log("  - Payment Method:", paymentMethod);
    console.log("  - Idempotency Key:", idempotencyKey);
    console.log("  - Has Address:", !!address);

    if (!user?.userId) {
      await mongoSession.abortTransaction();
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!address) {
      await mongoSession.abortTransaction();
      return res
        .status(400)
        .json({ success: false, error: "Address is required" });
    }

    // Check for duplicate order using idempotency key
    if (idempotencyKey) {
      console.log("🔍 Checking for existing order with idempotency key...");

      const existingOrder = await Order.findOne({
        "metadata.idempotencyKey": idempotencyKey,
      }).session(mongoSession);

      if (existingOrder) {
        console.log(
          "⚠️ Duplicate request detected! Returning existing order:",
          existingOrder.orderId,
        );

        const existingCheckoutSession = await CheckoutSession.findOne({
          orderId: existingOrder._id,
        }).session(mongoSession);

        await mongoSession.commitTransaction();
        mongoSession.endSession();

        return res.status(200).json({
          success: true,
          message: "Order already exists",
          checkoutSessionId: existingCheckoutSession?.checkoutSessionId,
          orderId: existingOrder.orderId,
          paymentIntentId: existingOrder.paymentIntentId || null, // ✅ Razorpay order ID
          paymentMethod:
            existingCheckoutSession?.paymentMethod || paymentMethod,
          finalAmount: existingOrder.finalAmount,
          currency: "INR",
          expiresAt: existingCheckoutSession?.expiresAt,
          zeptPayAccountId: existingOrder.zeptPayAccountId || null,
          appName: "TizzyGo",
          payer: {
            userId: user.userId,
            name: existingOrder.buyerName || "Customer",
            email: "",
          },
          isDuplicate: true,
          order: {
            _id: existingOrder._id,
            orderId: existingOrder.orderId,
            status: existingOrder.status,
          },
        });
      }
    }

    // Create payment intent with idempotency key
    const result = await createPaymentIntent({
      userId: user.userId,
      address,
      paymentMethod,
      session: mongoSession,
      idempotencyKey,
    });

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    const userDetails = Array.isArray(result.userDetails)
      ? result.userDetails[0]
      : result.userDetails;

    // ✅ Return response with paymentIntentId (Razorpay order ID)
    return res.status(200).json({
      success: true,
      message: result.isDuplicate
        ? "Order already exists"
        : paymentMethod === "cod"
          ? "✅ COD order created successfully"
          : "✅ Order created successfully",
      checkoutSessionId: result.checkoutSessionId,
      orderId: result.orderId,
      paymentIntentId: result.paymentIntentId, // ✅ YAHI - Razorpay order ID (starts with 'order_')
      paymentMethod,
      finalAmount: result.finalAmount,
      currency: "INR",
      expiresAt: result.expiresAt,
      zeptPayAccountId:
        result.zeptPayAccountId || result.productData?.zeptPayAccountId || null,
      appName: result.productData?.appName || "TizzyGo",
      payer: {
        userId: user.userId,
        name: userDetails?.name || "Customer",
        email: userDetails?.email || "",
      },
      isDuplicate: result.isDuplicate || false,
      order: {
        _id: result.order._id,
        orderId: result.order.orderId,
        status: result.order.status,
      },
    });
  } catch (err: any) {
    console.error("💥 CREATE PAYMENT INTENT ERROR:", err.message);
    console.error("  - Stack:", err.stack);

    await mongoSession.abortTransaction();
    mongoSession.endSession();

    let errorMessage = err.message;
    let statusCode = 500;

    if (errorMessage.includes("Cart is empty")) statusCode = 400;
    else if (errorMessage.includes("Product ID missing")) statusCode = 400;
    else if (errorMessage.includes("Cash on Delivery not available"))
      statusCode = 400;
    else if (errorMessage.includes("Invalid final amount")) statusCode = 400;
    else if (errorMessage.includes("active order already exists"))
      statusCode = 409;
    else if (errorMessage.includes("User not found")) statusCode = 404;

    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: err?.message || "Something went wrong",
    });
  }
};

export const getSessionStatusHandler = async (
  req: AuthRequest,
  res: Response,
) => {
  console.log("========================================");
  console.log("🔍 GET SESSION STATUS HANDLER CALLED");
  console.log("========================================");

  try {
    const user = req.user;
    const { checkoutSessionId } = req.params;

    console.log("📥 Request received:");
    console.log("  - User ID:", user?.userId);
    console.log("  - Checkout Session ID:", checkoutSessionId);

    if (!user?.userId) {
      console.log("❌ Unauthorized - No user ID");
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!checkoutSessionId) {
      console.log("❌ Checkout Session ID is required");
      return res
        .status(400)
        .json({ success: false, error: "Checkout session ID is required" });
    }

    console.log("🔍 Searching for session...");
    const session = await CheckoutSession.findOne({
      checkoutSessionId,
      userId: user.userId,
    }).lean<ICheckoutSession | null>();

    if (!session) {
      console.log("❌ Session not found for ID:", checkoutSessionId);
      return res.status(404).json({
        success: false,
        error: "Session not found",
      });
    }

    const order = await Order.findById(session.orderId).lean();
    const orderDoc = Array.isArray(order) ? order[0] : order;

    console.log("✅ Session found:");
    console.log("  - Status:", session.status);
    console.log("  - Payment Method:", session.paymentMethod);
    console.log("  - Order Status:", orderDoc?.status);
    console.log("  - Expires At:", session.expiresAt);

    return res.status(200).json({
      success: true,
      session: {
        checkoutSessionId: session.checkoutSessionId,
        status: session.status,
        paymentMethod: session.paymentMethod,
        paymentIntentId: session.paymentIntentId, // ✅ Razorpay order ID
        expiresAt: session.expiresAt,
      },
      order: orderDoc
        ? {
            _id: (orderDoc as any)._id,
            orderId: (orderDoc as any).orderId,
            status: (orderDoc as any).status,
            finalAmount: (orderDoc as any).finalAmount,
          }
        : null,
    });
  } catch (err: any) {
    console.error("💥 SESSION STATUS ERROR:");
    console.error("  - Error message:", err.message);
    console.error("  - Error stack:", err.stack);

    if (err.message === "Session not found") {
      return res
        .status(404)
        .json({ success: false, error: "Session not found" });
    }

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
