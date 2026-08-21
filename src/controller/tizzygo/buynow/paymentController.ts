import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import { createPaymentIntent } from "../../../services/tizzygo/paymentService";
import CheckoutSession, {
  ICheckoutSession,
} from "../../../models/tizzygo/checkout/CheckoutSession";
import Order from "../../../models/tizzygo/checkout/order";

interface CreatePaymentIntentRequestBody {
  address: string;
  paymentMethod?: string;
  idempotencyKey?: string;
  isBuyNow?: boolean;
  productId?: string;
  variantId?: string;
  quantity?: number;
  sellerId?: string;
  productDataId?: string;
}

interface UserDetails {
  name?: string;
  email?: string;
}

interface OrderRecord {
  _id: mongoose.Types.ObjectId | string;
  orderId: string;
  status: string;
  paymentStatus: string;
  finalAmount: number;
  productTitle?: string;
}

interface CreatePaymentIntentResult {
  checkoutSessionId: string;
  paymentIntentId: string | null;
  finalAmount: number;
  expiresAt: Date | string;
  isDuplicate?: boolean;
  userDetails?: UserDetails | UserDetails[];
  isCartCheckout?: boolean;
}

/**
 * ✅ CREATE PAYMENT INTENT HANDLER
 *
 * This is the ENTRY POINT for all payment intents.
 * It handles BOTH Buy Now AND Cart Checkout.
 *
 * CRITICAL RULES:
 * 1. If isBuyNow = true → MUST have productId, sellerId, productDataId
 * 2. If isBuyNow = true → NEVER query Cart
 * 3. If isBuyNow = false → Normal Cart checkout
 * 4. NEVER fallback to Cart for Buy Now
 */
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
    const {
      address,
      paymentMethod = "online",
      idempotencyKey,
      isBuyNow = false,
      productId,
      variantId,
      quantity = 1,
      sellerId,
      productDataId,
    } = req.body as CreatePaymentIntentRequestBody;

    console.log(`👤 User ID: ${user?.userId}`);
    console.log(`💳 Payment Method: ${paymentMethod}`);
    console.log(`🛒 Is Buy Now: ${isBuyNow}`);
    console.log(`📦 Product ID: ${productId || "NOT PROVIDED"}`);
    console.log(`🏷️ Seller ID: ${sellerId || "NOT PROVIDED"}`);
    console.log(`📋 Product Data ID: ${productDataId || "NOT PROVIDED"}`);

    // ✅ Validate user
    if (!user?.userId) {
      await mongoSession.abortTransaction();
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // ✅ Validate address
    if (!address) {
      await mongoSession.abortTransaction();
      return res
        .status(400)
        .json({ success: false, error: "Address is required" });
    }

    // ✅ ✅ ✅ STRICT BUY NOW VALIDATION ✅ ✅ ✅
    if (isBuyNow) {
      // ✅ productId is MANDATORY for Buy Now
      if (!productId) {
        await mongoSession.abortTransaction();
        return res.status(400).json({
          success: false,
          error: "Product ID is required for Buy Now checkout",
          code: "BUY_NOW_PRODUCT_ID_REQUIRED",
        });
      }

      // ✅ sellerId is MANDATORY for Buy Now
      if (!sellerId) {
        await mongoSession.abortTransaction();
        return res.status(400).json({
          success: false,
          error: "Seller ID is required for Buy Now checkout",
          code: "BUY_NOW_SELLER_ID_REQUIRED",
        });
      }

      // ✅ productDataId is MANDATORY for Buy Now
      if (!productDataId) {
        await mongoSession.abortTransaction();
        return res.status(400).json({
          success: false,
          error: "Product Data ID is required for Buy Now checkout",
          code: "BUY_NOW_PRODUCT_DATA_ID_REQUIRED",
        });
      }

      console.log("✅ Buy Now validation passed");
    }

    // ✅ Check for duplicate checkout session using idempotency key
    if (idempotencyKey) {
      console.log(
        "🔍 Checking for existing checkout session with idempotency key...",
      );

      const existingCheckoutSession = await CheckoutSession.findOne({
        "metadata.idempotencyKey": idempotencyKey,
      }).session(mongoSession);

      if (existingCheckoutSession) {
        console.log(
          `⚠️ Duplicate request detected! Returning existing checkout session: ${existingCheckoutSession.checkoutSessionId}`,
        );

        await mongoSession.commitTransaction();
        mongoSession.endSession();

        let orderDetails: any = null;
        let existingOrders: any[] = [];

        if (
          existingCheckoutSession.orderIds &&
          existingCheckoutSession.orderIds.length > 0
        ) {
          existingOrders = await Order.find({
            _id: { $in: existingCheckoutSession.orderIds },
          }).lean();
        } else if (existingCheckoutSession.orderId) {
          const order = await Order.findById(
            existingCheckoutSession.orderId,
          ).lean();
          if (order) existingOrders = [order];
        }

        if (existingOrders.length > 0) {
          orderDetails = existingOrders.map((o: any) => ({
            _id: o._id,
            orderId: o.orderId,
            status: o.status,
            paymentStatus: o.paymentStatus,
            finalAmount: o.finalAmount,
          }));
        }

        return res.status(200).json({
          success: true,
          message: "Checkout session already exists",
          checkoutSessionId: existingCheckoutSession.checkoutSessionId,
          paymentIntentId: existingCheckoutSession.paymentIntentId || null,
          paymentMethod: existingCheckoutSession.paymentMethod || paymentMethod,
          finalAmount:
            existingCheckoutSession.cartSnapshot?.calculatedData?.finalAmount ||
            0,
          currency: "INR",
          expiresAt: existingCheckoutSession.expiresAt,
          appName: "TizzyGo",
          payer: {
            userId: user.userId,
            name: user.name || "Customer",
            email: user.email || "",
          },
          isDuplicate: true,
          ...(existingOrders.length > 0 && {
            orders: orderDetails,
            isCompleted: true,
          }),
        });
      }
    }

    // ✅ Create payment intent
    const result = await createPaymentIntent({
      userId: user.userId,
      address,
      paymentMethod,
      session: mongoSession,
      idempotencyKey,
      isBuyNow,
      productId,
      variantId,
      quantity,
      sellerId,
      productDataId,
    });

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    const userDetails = Array.isArray(result.userDetails)
      ? result.userDetails[0]
      : result.userDetails;

    // ✅ Return response with CheckoutSession + Orders
    const orders = result.orders || [];
    const orderResponse =
      orders.length > 0
        ? orders.map((o: any) => ({
            _id: o._id,
            orderId: o.orderId,
            status: o.status,
            paymentStatus: o.paymentStatus,
            finalAmount: o.finalAmount,
            productTitle: o.productTitle || null,
          }))
        : [];

    return res.status(200).json({
      success: true,
      message: result.isDuplicate
        ? "Checkout session already exists"
        : paymentMethod === "cod"
          ? "✅ COD checkout session created"
          : "✅ Checkout session created successfully",
      checkoutSessionId: result.checkoutSessionId,
      paymentIntentId: result.paymentIntentId,
      paymentMethod,
      finalAmount: result.finalAmount,
      currency: "INR",
      expiresAt: result.expiresAt,
      appName: "TizzyGo",
      payer: {
        userId: user.userId,
        name: userDetails?.name || "Customer",
        email: userDetails?.email || "",
      },
      isDuplicate: result.isDuplicate || false,
      isCartCheckout: result.isCartCheckout || false,
      // ✅ ✅ ✅ Orders now exist before frontend receives response ✅ ✅ ✅
      orders: orderResponse,
      orderCount: orders.length,
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
    else if (errorMessage.includes("User not found")) statusCode = 404;
    else if (errorMessage.includes("Buy Now")) statusCode = 400;
    else if (errorMessage.includes("required")) statusCode = 400;

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

    console.log(`📥 User ID: ${user?.userId}`);
    console.log(`📥 Checkout Session ID: ${checkoutSessionId}`);

    if (!user?.userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!checkoutSessionId) {
      return res
        .status(400)
        .json({ success: false, error: "Checkout session ID is required" });
    }

    const session = await CheckoutSession.findOne({
      checkoutSessionId,
      userId: user.userId,
    }).lean<ICheckoutSession | null>();

    if (!session) {
      console.log(`❌ Session not found: ${checkoutSessionId}`);
      return res.status(404).json({
        success: false,
        error: "Session not found",
      });
    }

    console.log(`✅ Session found: ${session.checkoutSessionId}`);
    console.log(`  - Status: ${session.status}`);
    console.log(`  - Payment Method: ${session.paymentMethod}`);
    console.log(`  - Grand Total: ${session.metadata?.grandTotal || 0}`);

    let orders: OrderRecord[] = [];
    if (session.orderIds && session.orderIds.length > 0) {
      orders = await Order.find({
        _id: { $in: session.orderIds },
      }).lean<OrderRecord[]>();
    } else if (session.orderId) {
      const order = await Order.findById(session.orderId).lean<OrderRecord>();
      if (order) orders = [order];
    }

    return res.status(200).json({
      success: true,
      session: {
        checkoutSessionId: session.checkoutSessionId,
        status: session.status,
        paymentMethod: session.paymentMethod,
        paymentIntentId: session.paymentIntentId,
        expiresAt: session.expiresAt,
        isCartCheckout:
          (session.orderIds && session.orderIds.length > 1) || false,
        grandTotal:
          session.metadata?.grandTotal ||
          session.cartSnapshot?.calculatedData?.finalAmount ||
          0,
      },
      orders: orders.map((o: any) => ({
        _id: o._id,
        orderId: o.orderId,
        status: o.status,
        paymentStatus: o.paymentStatus,
        finalAmount: o.finalAmount,
        productTitle: o.productTitle,
      })),
    });
  } catch (err: any) {
    console.error("💥 SESSION STATUS ERROR:", err);

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
