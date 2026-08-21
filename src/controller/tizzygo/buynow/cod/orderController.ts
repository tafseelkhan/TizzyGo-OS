// ============================================================
// controllers/tizzygo/checkout/confirmCOD.ts
// ============================================================

import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../../../../middleware/tizzygo/authMiddleware";
import { confirmCODOrder } from "../../../../services/tizzygo/orderService";

/**
 * ✅ CONFIRM COD ORDER - CONTROLLER
 *
 * This endpoint confirms a Cash on Delivery order.
 *
 * ⚠️ CRITICAL: This does NOT create new Orders.
 * It only confirms existing Orders created by createPaymentIntent().
 *
 * Flow:
 * 1. Validate request
 * 2. Update existing Order(s)
 * 3. Update Transaction
 * 4. Update CheckoutSession
 * 5. Clear Cart
 * 6. Return updated data
 */
export const confirmCOD = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("========================================");
    console.log("🎯 /confirm-cod CALLED");
    console.log("========================================");

    const user = req.user;
    const { checkoutSessionId } = req.body;

    // ✅ Validate user
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({
        success: false,
        error: "Unauthorized: User missing",
      });
    }

    if (!user.userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({
        success: false,
        error: "Unauthorized: User ID missing",
      });
    }

    // ✅ Validate checkoutSessionId
    if (!checkoutSessionId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "checkoutSessionId is required",
      });
    }

    console.log(`📋 CheckoutSession ID: ${checkoutSessionId}`);
    console.log(`👤 User ID: ${user.userId}`);

    // ✅ Confirm COD Order - Updates existing records
    const result = await confirmCODOrder({
      checkoutSessionId,
      userId: user.userId,
      session,
    });

    // ✅ Commit transaction
    await session.commitTransaction();
    session.endSession();

    console.log("✅ COD order confirmed successfully");
    console.log(`📦 ${result.orders.length} order(s) confirmed`);
    console.log(`📋 Checkout status: ${result.checkoutSession.status}`);
    console.log("========================================");

    // ✅ Format response
    const orderData = result.orders.map((order: any) => ({
      _id: order._id,
      orderId: order.orderId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      finalAmount: order.finalAmount,
      productName: result.firstItem?.productData?.title || "Product",
      buyerAddress: order.buyerAddress,
      sellerAddress: order.sellerAddress,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      buyerId: order.buyerId,
      buyerName: order.buyerName,
      sellerId: order.sellerId,
    }));

    return res.json({
      success: true,
      message: "COD order confirmed successfully",
      checkoutSession: {
        checkoutSessionId: result.checkoutSession.checkoutSessionId,
        status: result.checkoutSession.status,
        paymentMethod: result.checkoutSession.paymentMethod,
        completedAt: result.checkoutSession.completedAt,
      },
      transaction: result.transaction
        ? {
            _id: result.transaction._id,
            transactionId: result.transaction.transactionId,
            status: result.transaction.status,
          }
        : null,
      orders: result.isBuyNow ? orderData[0] : orderData,
      orderCount: result.orders.length,
      isBuyNow: result.isBuyNow,
      isCartCheckout: result.isCartCheckout,
    });
  } catch (err: any) {
    // ✅ Rollback transaction on error
    await session.abortTransaction();
    session.endSession();

    console.error("========================================");
    console.error("💥 Error in /confirm-cod");
    console.error("========================================");
    console.error("Message:", err.message);
    console.error("Stack:", err.stack);
    console.error("========================================");

    // ✅ Handle specific error types
    let errorMessage = err.message;
    let statusCode = 500;

    if (errorMessage.includes("Checkout session not found")) {
      statusCode = 404;
    } else if (errorMessage.includes("Invalid payment method")) {
      statusCode = 400;
    } else if (errorMessage.includes("No orders found")) {
      statusCode = 404;
    } else if (errorMessage.includes("expired")) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: err.message || "Unknown error occurred",
    });
  }
};
