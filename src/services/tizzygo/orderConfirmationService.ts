// ============================================================
// services/tizzygo/orderConfirmationService.ts - FIXED
// ============================================================
// ✅ REMOVED: remainingSeconds, remainingTime, expiresIn
// ✅ REMOVED: auto-redirect logic
// ✅ KEPT: Only basic timer info for UI state

import mongoose from "mongoose";
import CheckoutSession from "../../models/tizzygo/checkout/CheckoutSession";
import Order from "../../models/tizzygo/checkout/order";
import Transaction from "../../models/tizzygo/checkout/Transaction";
import {
  ConfirmationStatus,
  PaymentMethod,
  TimerInfo,
  OrderSummary,
  OrderConfirmationOrder,
  NavigationConfig,
  ButtonsConfig,
  OrderConfirmationResponse,
} from "../../types/tizzygo/orderConfirmation";

export class OrderConfirmationService {
  /**
   * Get order confirmation data
   */
  static async getConfirmation(
    checkoutSessionId: string,
    userId: string,
  ): Promise<OrderConfirmationResponse> {
    // 1. Find checkout session
    const checkoutSession = await CheckoutSession.findOne({
      checkoutSessionId,
      userId,
    });

    if (!checkoutSession) {
      throw new Error("Checkout session not found");
    }

    // 2. Get orders
    let orderIds: mongoose.Types.ObjectId[] = [];
    if (checkoutSession.orderIds && checkoutSession.orderIds.length > 0) {
      orderIds = checkoutSession.orderIds;
    } else if (checkoutSession.orderId) {
      orderIds = [checkoutSession.orderId];
    }

    if (orderIds.length === 0) {
      throw new Error("No orders found for this checkout session");
    }

    // 3. Fetch orders with seller details
    const orders = await Order.find({ _id: { $in: orderIds } })
      .populate("sellerId", "name storeName")
      .lean();

    // 4. Get transaction (only for ONLINE)
    const transaction = checkoutSession.transactionId
      ? await Transaction.findById(checkoutSession.transactionId).lean()
      : null;

    // 5. Determine payment method
    const paymentMethod = this.getPaymentMethod(checkoutSession);

    // 6. ✅ FIXED: Timer - NO countdown, NO remaining time
    const timer = this.getTimerInfo(checkoutSession, paymentMethod);

    // 7. Determine confirmation status based on payment method
    const confirmationStatus = this.determineStatus(
      checkoutSession,
      orders,
      transaction,
      paymentMethod,
    );

    // 8. Build summary
    const summary = this.buildSummary(orders, checkoutSession);

    // 9. Format orders
    const formattedOrders = this.formatOrders(orders);

    // 10. ✅ FIXED: Navigation - NO auto-redirect
    const navigation = this.getNavigationConfig(confirmationStatus);

    // 11. Get buttons config
    const buttons = this.getButtonsConfig(
      confirmationStatus,
      checkoutSession,
      formattedOrders,
    );

    // 12. Build response
    return {
      success: true,
      confirmationStatus,
      paymentMethod,
      checkoutSession: {
        checkoutSessionId: checkoutSession.checkoutSessionId,
        status: checkoutSession.status,
        paymentGateway: checkoutSession.paymentGateway || "razorpay",
        paymentIntentId: checkoutSession.paymentIntentId,
      },
      timer,
      summary,
      orders: formattedOrders,
      trackingAvailable: formattedOrders.some((o) => o.trackingAvailable),
      buttons,
      navigation,
    };
  }

  /**
   * ✅ FIXED: Get timer info - NO countdown
   */
  private static getTimerInfo(
    checkoutSession: any,
    paymentMethod: PaymentMethod,
  ): TimerInfo {
    const now = new Date();
    const serverTime = now.toISOString();
    const createdAt =
      checkoutSession.createdAt?.toISOString() || now.toISOString();
    const completedAt = checkoutSession.completedAt?.toISOString();

    // ✅ Only keep expiresAt as metadata, NOT exposed for countdown
    const expiresAt =
      checkoutSession.expiresAt?.toISOString() ||
      new Date(now.getTime() + 30 * 60000).toISOString();

    return {
      serverTime,
      createdAt,
      completedAt,
      expiresAt,
      // ✅ ALL ZERO - No countdown
      remainingMilliseconds: 0,
      remainingSeconds: 0,
      remainingMinutes: 0,
      isExpired: false,
    };
  }

  /**
   * Determine confirmation status based on payment method
   */
  private static determineStatus(
    checkoutSession: any,
    orders: any[],
    transaction: any,
    paymentMethod: PaymentMethod,
  ): ConfirmationStatus {
    console.log(`🔍 Determining status for paymentMethod: ${paymentMethod}`);
    console.log(`📦 Orders: ${orders.length}`);
    console.log(`📋 CheckoutSession status: ${checkoutSession.status}`);

    // ✅ COD FLOW: Ignore transaction, only check orders
    if (paymentMethod === PaymentMethod.COD) {
      console.log("💰 COD: Ignoring transaction, checking orders only...");

      // Check if all orders are cod_confirmed
      const allCODConfirmed = orders.every(
        (o) =>
          o.status === "cod_confirmed" || o.paymentStatus === "cod_confirmed",
      );

      const allCancelled = orders.every(
        (o) => o.status === "cancelled" || o.paymentStatus === "cancelled",
      );

      if (allCODConfirmed && checkoutSession.status === "completed") {
        console.log("✅ COD: All orders confirmed, returning SUCCESS");
        return ConfirmationStatus.SUCCESS;
      }

      if (allCancelled) {
        console.log("❌ COD: All orders cancelled, returning FAILED");
        return ConfirmationStatus.FAILED;
      }

      console.log("⏳ COD: Orders not yet confirmed, returning PENDING");
      return ConfirmationStatus.PENDING;
    }

    // ✅ ONLINE FLOW
    // Check if completed
    if (checkoutSession.status === "completed") {
      const allCompleted = orders.every(
        (o) =>
          o.paymentStatus === "captured" || o.paymentStatus === "succeeded",
      );

      const anyFailed = orders.some(
        (o) => o.paymentStatus === "failed" || o.paymentStatus === "cancelled",
      );

      if (allCompleted) {
        return ConfirmationStatus.SUCCESS;
      }

      if (anyFailed) {
        return ConfirmationStatus.FAILED;
      }

      return ConfirmationStatus.PENDING;
    }

    // ONLINE: If session is still pending
    if (checkoutSession.status === "pending") {
      const anyFailed = orders.some(
        (o) => o.paymentStatus === "failed" || o.paymentStatus === "cancelled",
      );

      if (anyFailed) {
        return ConfirmationStatus.FAILED;
      }

      return ConfirmationStatus.PENDING;
    }

    return ConfirmationStatus.PENDING;
  }

  /**
   * Build order summary
   */
  private static buildSummary(
    orders: any[],
    checkoutSession: any,
  ): OrderSummary {
    const subtotal = orders.reduce((sum, o) => sum + (o.finalAmount || 0), 0);
    const gst = orders.reduce((sum, o) => sum + (o.productGst || 0), 0);
    const platformFee = orders.reduce(
      (sum, o) => sum + (o.platformFee || 0),
      0,
    );
    const deliveryCharge = orders.reduce(
      (sum, o) => sum + (o.deliveryCharge || 0),
      0,
    );
    const discount = orders.reduce(
      (sum, o) => sum + (o.discountApplied || 0),
      0,
    );
    const grandTotal = checkoutSession.metadata?.grandTotal || subtotal;

    return {
      subtotal,
      gst,
      platformFee,
      deliveryCharge,
      discount,
      grandTotal,
    };
  }

  /**
   * Format orders for response
   */
  private static formatOrders(orders: any[]): OrderConfirmationOrder[] {
    return orders.map((order) => {
      const firstItem = order.items?.[0] || {};
      const productData = firstItem.productData || {};

      return {
        _id: order._id.toString(),
        orderId: order.orderId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        sellerId:
          order.sellerId?._id?.toString() || order.sellerId?.toString() || "",
        sellerName:
          order.sellerId?.name || order.sellerId?.storeName || "Seller",
        productTitle: productData.title || "Product",
        productImage: productData.images?.[0] || "",
        quantity: firstItem.quantity || 1,
        variant: firstItem.selectedVariant?.name || "",
        price: order.finalAmount || 0,
        trackingAvailable:
          order.status === "cod_confirmed" ||
          order.paymentStatus === "captured",
      };
    });
  }

  /**
   * Get payment method
   */
  private static getPaymentMethod(checkoutSession: any): PaymentMethod {
    if (checkoutSession.paymentMethod === "cod") {
      return PaymentMethod.COD;
    }
    return PaymentMethod.ONLINE;
  }

  /**
   * ✅ FIXED: Navigation - NO auto-redirect
   */
  private static getNavigationConfig(
    status: ConfirmationStatus,
  ): NavigationConfig {
    // ✅ NO auto-redirect for any status
    return { autoRedirect: false, redirectAfterSeconds: 0 };
  }

  /**
   * Get buttons config
   */
  private static getButtonsConfig(
    status: ConfirmationStatus,
    checkoutSession: any,
    orders: OrderConfirmationOrder[],
  ): ButtonsConfig {
    const trackingAvailable = orders.some((o) => o.trackingAvailable);

    switch (status) {
      case ConfirmationStatus.SUCCESS:
        return {
          canGoHome: true,
          canRetryPayment: false,
          canTrackOrder: trackingAvailable,
        };
      case ConfirmationStatus.FAILED:
        return {
          canGoHome: true,
          canRetryPayment: checkoutSession.paymentMethod !== "cod",
          canTrackOrder: false,
        };
      case ConfirmationStatus.PENDING:
        return {
          canGoHome: false,
          canRetryPayment: false,
          canTrackOrder: false,
        };
      case ConfirmationStatus.EXPIRED:
        return {
          canGoHome: true,
          canRetryPayment: false,
          canTrackOrder: false,
        };
      default:
        return {
          canGoHome: false,
          canRetryPayment: false,
          canTrackOrder: false,
        };
    }
  }
}
