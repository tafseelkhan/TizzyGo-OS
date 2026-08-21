// src/schedulers/cleanupScheduler.ts

import mongoose from "mongoose";
import cron from "node-cron";
import CheckoutSession from "../models/tizzygo/checkout/CheckoutSession";
import Order from "../models/tizzygo/checkout/order";
import { logger } from "../utils/tizzyos/seller/logger";
import Transaction from "../models/tizzygo/checkout/Transaction";

/**
 * ✅ Abandoned Payment Cleanup Scheduler
 *
 * Runs every 10 minutes
 * Finds pending checkout sessions older than 30 minutes
 * Deletes them atomically with their orders and transactions
 *
 * Only deletes if:
 * - CheckoutSession.status === "pending"
 * - CheckoutSession.createdAt < (now - 30 minutes)
 * - Orders.status === "pending"
 * - Transaction.status === "pending"
 */
export function startCleanupScheduler() {
  // Run every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    logger.info("🧹 Running abandoned payment cleanup...");
    await cleanupAbandonedPayments();
  });

}

/**
 * ✅ Cleanup abandoned payments
 */
async function cleanupAbandonedPayments() {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const timeoutMinutes = parseInt(
      process.env.PAYMENT_TIMEOUT_MINUTES || "30",
    );
    const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    // ✅ Find abandoned checkout sessions
    const abandonedSessions = await CheckoutSession.find({
      status: "pending",
      createdAt: { $lt: cutoffTime },
    }).session(session);

    for (const checkoutSession of abandonedSessions) {
      console.log(
        `🧹 Cleaning up session: ${checkoutSession.checkoutSessionId}`,
      );

      // ✅ Get associated orders
      const orderIds = checkoutSession.orderIds || [];
      if (orderIds.length > 0) {
        const orders = await Order.find({
          _id: { $in: orderIds },
          status: "pending",
        }).session(session);

        console.log(`📦 Deleting ${orders.length} abandoned orders...`);

        // ✅ Delete orders
        for (const order of orders) {
          await Order.deleteOne({ _id: order._id }).session(session);
          console.log(`🗑️ Deleted abandoned order: ${order.orderId}`);
        }
      }

      // ✅ Get associated transaction
      if (checkoutSession.transactionId) {
        const transaction = await Transaction.findOne({
          _id: checkoutSession.transactionId,
          status: "pending",
        }).session(session);

        if (transaction) {
          await Transaction.deleteOne({ _id: transaction._id }).session(
            session,
          );
          console.log(
            `🗑️ Deleted abandoned transaction: ${transaction.transactionId}`,
          );
        }
      }

      // ✅ Delete checkout session
      await CheckoutSession.deleteOne({ _id: checkoutSession._id }).session(
        session,
      );
      console.log(
        `🗑️ Deleted abandoned checkout session: ${checkoutSession.checkoutSessionId}`,
      );
    }

    await session.commitTransaction();
  } catch (error: any) {
    console.error("❌ Cleanup error:", error);
    await session.abortTransaction();

    // ✅ Log error but don't throw - scheduler should continue
    console.error("⚠️ Cleanup transaction aborted");
  } finally {
    session.endSession();
  }
}
