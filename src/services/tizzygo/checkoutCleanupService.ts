// services/checkoutCleanupService.ts
import CheckoutSession from "../../models/tizzygo/checkout/CheckoutSession";

export async function cleanupExpiredCheckoutSessions() {
  try {
    const result = await CheckoutSession.updateMany(
      {
        status: "pending",
        expiresAt: { $lt: new Date() }
      },
      {
        status: "expired"
      }
    );
    
    console.log(`🔄 Cleaned up ${result.modifiedCount} expired checkout sessions`);
    return result.modifiedCount;
  } catch (error) {
    console.error("❌ Error cleaning up expired checkout sessions:", error);
    throw error;
  }
}

// Run this periodically (e.g., every hour) using a cron job