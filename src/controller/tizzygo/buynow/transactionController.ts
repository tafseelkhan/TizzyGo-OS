import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import {
  processPayment,
  getOrderStatus,
} from "../../../services/tizzygo/transactionService";
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
    } = req.body;

    // Validate request
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

    // Process payment
    const result = await processPayment({
      checkoutSessionId,
      paymentType,
      userId: user!.userId,
      user,
      transactionId,
      frequency,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : null,
      session: mongoSession,
    });

    // Commit transaction
    await mongoSession.commitTransaction();
    mongoSession.endSession();

    // Return success response
    return res.status(200).json({
      success: true,
      transaction: {
        _id: result.paymentIntentId || result.zeptpayResponse?._id,
        zeptpayTransactionId:
          result.zeptpayResponse?.zeptpayTransactionId ||
          result.paymentIntentId,
        amount: result.amount,
        currency: "INR",
        paymentMethod: paymentType,
        status: result.paymentStatus,
        paidAt: result.zeptpayResponse?.paidAt || new Date().toISOString(),
        payer: result.payer,
        receiver: { name: result.appName },
        source: result.zeptpayResponse?.source || "ecommerce",
        orderId: result.order.orderId,
        transactionId: transactionId || null,
      },
      zeptpayResponse: result.zeptpayResponse,
      status: result.paymentStatus,
      paymentType,
      transactionId,
      paymentIntentId: result.paymentIntentId,
      orderId: result.order.orderId,
      order: {
        _id: result.order._id,
        orderId: result.order.orderId,
        status: result.order.status,
        paymentStatus: result.order.paymentStatus,
        finalAmount: result.amount,
      },
    });
  } catch (err: any) {
    await mongoSession.abortTransaction();
    mongoSession.endSession();

    console.error("💥 PROCESS PAYMENT ERROR:", err);

    // Update session status if possible
    if (req.body.checkoutSessionId) {
      try {
        await CheckoutSession.findOneAndUpdate(
          { checkoutSessionId: req.body.checkoutSessionId },
          { status: "failed", errorMessage: err?.message || "Unknown error" },
        );
      } catch (updateError) {
        console.error("❌ FAILED TO UPDATE SESSION:", updateError);
      }
    }

    // Handle specific errors
    let statusCode = 500;
    let errorMessage = err.message;

    if (errorMessage.includes("not found")) statusCode = 404;
    else if (errorMessage.includes("already paid")) statusCode = 400;
    else if (errorMessage.includes("expired")) statusCode = 400;
    else if (errorMessage.includes("missing")) statusCode = 400;
    else if (errorMessage.includes("Invalid")) statusCode = 400;

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
