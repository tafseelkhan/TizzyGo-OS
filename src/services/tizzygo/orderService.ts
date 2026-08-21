// ============================================================
// services/tizzygo/orderService.ts
// ============================================================

import mongoose from "mongoose";
import Order from "../../models/tizzygo/checkout/order";
import CheckoutSession from "../../models/tizzygo/checkout/CheckoutSession";
import Transaction from "../../models/tizzygo/checkout/Transaction";
import Cart from "../../models/tizzygo/cart/Cart";

interface ConfirmCODParams {
  checkoutSessionId: string;
  userId: string;
  session: mongoose.ClientSession;
}

/**
 * ✅ Validate COD Checkout Session
 *
 * Checks if the checkout session exists, is pending, and is valid for COD.
 */
export const validateCheckoutSession = async (
  checkoutSessionId: string,
  userId: string,
): Promise<any> => {
  console.log(`🔍 Validating COD checkout session: ${checkoutSessionId}`);

  const checkoutSession = await CheckoutSession.findOne({
    checkoutSessionId,
    userId: userId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });

  if (!checkoutSession) {
    throw new Error(
      "Checkout session not found, expired, or already completed",
    );
  }

  if (checkoutSession.paymentMethod !== "cod") {
    throw new Error("Invalid payment method for COD confirmation");
  }

  console.log(
    `✅ Checkout session validated: ${checkoutSession.checkoutSessionId}`,
  );
  return checkoutSession;
};

/**
 * ✅ Confirm COD Order - UPDATES EXISTING ORDER(S)
 *
 * ⚠️ CRITICAL: This function does NOT create new Orders.
 * It ONLY updates existing Orders, Transaction, and CheckoutSession.
 *
 * Flow:
 * 1. Validate session
 * 2. Find existing Order(s) via checkoutSession
 * 3. Update Order status to "cod_confirmed"
 * 4. Update Transaction status to "pending"
 * 5. Update CheckoutSession status to "completed"
 * 6. Clear user's cart
 */
export const confirmCODOrder = async ({
  checkoutSessionId,
  userId,
  session,
}: ConfirmCODParams) => {
  console.log("📦 Starting COD order confirmation...");
  console.log(`📋 CheckoutSession ID: ${checkoutSessionId}`);
  console.log(`👤 User ID: ${userId}`);

  // ✅ Step 1: Validate checkout session
  const checkoutSession = await validateCheckoutSession(
    checkoutSessionId,
    userId,
  );

  // ✅ Step 2: Get existing orders
  let orderIds: mongoose.Types.ObjectId[] = [];
  let orders: any[] = [];

  // ✅ Determine if Buy Now or Cart
  const isBuyNow = checkoutSession.metadata?.isBuyNow || false;
  const isCartCheckout =
    checkoutSession.orderIds && checkoutSession.orderIds.length > 1;

  console.log(
    `📦 Order type: ${isBuyNow ? "Buy Now" : isCartCheckout ? "Multi-Order Cart" : "Single Order Cart"}`,
  );

  if (isBuyNow && checkoutSession.orderId) {
    // ✅ Buy Now: Single order via orderId
    console.log(
      `📦 Buy Now - Finding order by orderId: ${checkoutSession.orderId}`,
    );
    const order = await Order.findById(checkoutSession.orderId).session(
      session,
    );
    if (order) {
      orders.push(order);
      orderIds.push(order._id);
    }
  } else if (checkoutSession.orderIds && checkoutSession.orderIds.length > 0) {
    // ✅ Cart Checkout: Multiple orders
    console.log(
      `📦 Cart Checkout - Finding ${checkoutSession.orderIds.length} orders`,
    );
    for (const orderId of checkoutSession.orderIds) {
      const order = await Order.findById(orderId).session(session);
      if (order) {
        orders.push(order);
        orderIds.push(order._id);
      }
    }
  } else if (checkoutSession.orderId) {
    // ✅ Single order (fallback)
    console.log(
      `📦 Single order - Finding by orderId: ${checkoutSession.orderId}`,
    );
    const order = await Order.findById(checkoutSession.orderId).session(
      session,
    );
    if (order) {
      orders.push(order);
      orderIds.push(order._id);
    }
  }

  // ✅ Validate orders exist
  if (orders.length === 0) {
    throw new Error(
      `No orders found for checkout session: ${checkoutSessionId}. ` +
        `OrderIds: ${JSON.stringify(checkoutSession.orderIds || [])}`,
    );
  }

  console.log(`✅ Found ${orders.length} order(s) to confirm`);

  // ✅ Step 3: Update ALL orders
  const updatedOrders = [];
  for (const order of orders) {
    // ✅ CRITICAL: Update existing order - DO NOT CREATE NEW ORDER
    order.status = "cod_confirmed";
    order.paymentStatus = "pending";
    order.paymentMethod = "cod";
    order.updatedAt = new Date();

    // ✅ Preserve all existing fields - only update status
    await order.save({ session });
    updatedOrders.push(order);

    console.log(`✅ Order ${order.orderId} updated to: ${order.status}`);
  }

  // ✅ Step 4: Update Transaction
  let updatedTransaction = null;
  if (checkoutSession.transactionId) {
    console.log(`💳 Finding transaction: ${checkoutSession.transactionId}`);
    const transaction = await Transaction.findById(
      checkoutSession.transactionId,
    ).session(session);

    if (transaction) {
      // ✅ Update transaction status
      transaction.status = "pending";

      // ✅ Ensure metadata exists
      if (!transaction.metadata) {
        transaction.metadata = {};
      }
      transaction.metadata.paymentType = "cod";
      transaction.metadata.confirmedAt = new Date();
      transaction.metadata.checkoutSessionId = checkoutSessionId;

      await transaction.save({ session });
      updatedTransaction = transaction;

      console.log(
        `✅ Transaction ${transaction.transactionId} updated to: pending`,
      );
    } else {
      console.warn(
        `⚠️ Transaction not found: ${checkoutSession.transactionId}`,
      );
    }
  }

  // ✅ Step 5: Update CheckoutSession
  checkoutSession.status = "completed";
  checkoutSession.paymentMethod = "cod";
  checkoutSession.completedAt = new Date();

  // ✅ Ensure metadata exists
  if (!checkoutSession.metadata) {
    checkoutSession.metadata = {};
  }
  checkoutSession.metadata.confirmedAt = new Date();
  checkoutSession.metadata.confirmationMethod = "cod";

  await checkoutSession.save({ session });
  console.log(
    `✅ CheckoutSession ${checkoutSession.checkoutSessionId} updated to: completed`,
  );

  // ✅ Step 6: Clear user's cart
  console.log(`🗑️ Clearing cart for user: ${userId}`);
  const cartResult = await Cart.deleteMany({ userId: userId }).session(session);
  console.log(`✅ Deleted ${cartResult.deletedCount || 0} cart items`);

  // ✅ Step 7: Return updated data
  const firstItem = checkoutSession.cartSnapshot?.items?.[0] || {};

  return {
    checkoutSession,
    orders: updatedOrders,
    transaction: updatedTransaction,
    orderIds: orderIds,
    isBuyNow,
    isCartCheckout: isCartCheckout || orders.length > 1,
    firstItem,
  };
};
