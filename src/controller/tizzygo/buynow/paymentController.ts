import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import { createPaymentIntent } from "../../../services/tizzygo/paymentService";
import CheckoutSession, {
  ICheckoutSession,
} from "../../../models/tizzygo/checkout/CheckoutSession";

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
    const { address, paymentMethod = "online" } = req.body;

    console.log("📥 Request received:");
    console.log("  - User ID:", user?.userId);
    console.log("  - Payment Method:", paymentMethod);
    console.log(
      "  - Address:",
      address ? JSON.stringify(address).substring(0, 200) : "MISSING",
    );

    // Validation
    if (!user?.userId) {
      console.log("❌ Unauthorized - No user ID");
      await mongoSession.abortTransaction();
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!address) {
      console.log("❌ Address is required - No address provided");
      await mongoSession.abortTransaction();
      return res
        .status(400)
        .json({ success: false, error: "Address is required" });
    }

    console.log("✅ Validation passed, creating payment intent...");

    // Create payment intent
    const result = await createPaymentIntent({
      userId: user.userId,
      address,
      paymentMethod,
      session: mongoSession,
    });

    console.log("✅ Payment intent created successfully");
    console.log("  - Checkout Session ID:", result.checkoutSessionId);
    console.log("  - Order ID:", result.orderId);
    console.log("  - Final Amount:", result.finalAmount);
    console.log("  - Vendor Code UID:", result.productData?.vendorCodeUID);

    // Commit transaction
    await mongoSession.commitTransaction();
    mongoSession.endSession();
    console.log("✅ Transaction committed");

    // Return response
    return res.status(200).json({
      success: true,
      message:
        paymentMethod === "cod"
          ? "✅ COD order created successfully"
          : "✅ Order created successfully",
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
    console.error("💥 CREATE PAYMENT INTENT ERROR:");
    console.error("  - Error message:", err.message);
    console.error("  - Error stack:", err.stack);

    await mongoSession.abortTransaction();
    mongoSession.endSession();
    console.log("❌ Transaction aborted");

    // Handle specific errors
    let errorMessage = err.message;
    let statusCode = 500;

    if (errorMessage.includes("Cart is empty")) {
      statusCode = 400;
      console.log("⚠️ Cart is empty error");
    } else if (errorMessage.includes("Product ID missing")) {
      statusCode = 400;
      console.log("⚠️ Product ID missing error");
    } else if (errorMessage.includes("Cash on Delivery not available")) {
      statusCode = 400;
      console.log("⚠️ COD not available error");
    } else if (errorMessage.includes("Invalid final amount")) {
      statusCode = 400;
      console.log("⚠️ Invalid final amount error");
    }

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

    console.log("✅ Session found:");
    console.log("  - Status:", session.status);
    console.log("  - Payment Method:", session.paymentMethod);
    console.log("  - Expires At:", session.expiresAt);

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
