import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import { createPaymentIntent } from "../../../services/tizzygo/paymentService";
import CheckoutSession, {
  ICheckoutSession,
} from "../../../models/tizzygo/checkout/CheckoutSession";

export const createPaymentIntentHandler = async (req: AuthRequest, res: Response) => {
  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    const user = req.user;
    const { address, paymentMethod = "online" } = req.body;

    // Validation
    if (!user?.userId) {
      await mongoSession.abortTransaction();
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!address) {
      await mongoSession.abortTransaction();
      return res.status(400).json({ success: false, error: "Address is required" });
    }

    // Create payment intent
    const result = await createPaymentIntent({
      userId: user.userId,
      address,
      paymentMethod,
      session: mongoSession,
    });

    // Commit transaction
    await mongoSession.commitTransaction();
    mongoSession.endSession();

    // Return response
    return res.status(200).json({
      success: true,
      message: paymentMethod === "cod" ? "✅ COD order created successfully" : "✅ Order created successfully",
      checkoutSessionId: result.checkoutSessionId,
      orderId: result.orderId,
      paymentMethod,
      finalAmount: result.finalAmount,
      currency: "INR",
      expiresAt: result.expiresAt,
      vendorCodeUID: result.productData?.vendorCodeUID || null,
      appName: result.productData?.appName || "TizzyGo",
      payer: {
        userId: user.userId,
        name: (result.userDetails as any)?.name || "Customer",
        email: (result.userDetails as any)?.email || "",
      },
      order: {
        _id: result.order._id,
        orderId: result.order.orderId,
        status: result.order.status,
        paymentStatus: result.order.paymentStatus,
      },
    });

  } catch (err: any) {
    await mongoSession.abortTransaction();
    mongoSession.endSession();

    console.error("💥 CREATE PAYMENT INTENT ERROR:", err);

    // Handle specific errors
    let errorMessage = err.message;
    let statusCode = 500;

    if (errorMessage.includes("Cart is empty")) statusCode = 400;
    else if (errorMessage.includes("Product ID missing")) statusCode = 400;
    else if (errorMessage.includes("Cash on Delivery not available")) statusCode = 400;
    else if (errorMessage.includes("Invalid final amount")) statusCode = 400;

    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: err?.message || "Something went wrong",
    });
  }
};

export const getSessionStatusHandler = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    const { checkoutSessionId } = req.params;

    if (!user?.userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

      const session = await CheckoutSession.findOne({
        checkoutSessionId,
        userId: user.userId,
      }).lean<ICheckoutSession | null>();

      if (!session) {
        return res.status(404).json({
          success: false,
          error: "Session not found",
        });
      }

      return res.status(200).json({
        success: true,

        session: {
          checkoutSessionId: session.checkoutSessionId,

          status: session.status,

          paymentMethod: session.paymentMethod,

          paymentIntentId: session.paymentIntentId,

          expiresAt: session.expiresAt,
        },
      });

  } catch (err: any) {
    console.error("💥 SESSION STATUS ERROR:", err);

    if (err.message === "Session not found") {
      return res.status(404).json({ success: false, error: "Session not found" });
    }

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};