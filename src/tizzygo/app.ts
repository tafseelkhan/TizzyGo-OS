import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import cron from "node-cron";

import { runCleanupJob } from "../jobs/cronMediaCleanup";
import { startCleanupScheduler } from "../schedulers/cleanupScheduler";
import { logger } from "../utils/tizzyos/seller/logger";

// 🔥 IMPORT WEBHOOK FIRST
import webhookRoutes from "../routes/tizzygo/buynow/razorpayWebhookRoutes";

import authRoutes from "../routes/auth/authRoutes";
import colorRoutes from "../routes/auth/colorRoutes";
import cartRoutes from "../routes/tizzygo/cart/addToCartRoutes";
import buynowShopRoutes from "../routes/tizzygo/shop/buynowRoutes";
import commentRoutes from "../routes/tizzygo/social/commentRoutes";
import likeRoutes from "../routes/tizzygo/social/likeRoutes";
import ratingRoutes from "../routes/tizzygo/social/ratingRoutes";
import shareRoutes from "../routes/tizzygo/social/shareRoutes";
import buynowRoutes from "../routes/tizzygo/buynow/buynowRoutes";
import paymentRoutes from "../routes/tizzygo/buynow/paymentRoutes";
import cartCheckoutRoutes from "../routes/tizzygo/cart/cartCheckoutRoutes";
import processPaymentRoutes from "../routes/tizzygo/buynow/process-paymentRoutes";
import searchRoutes from "../routes/tizzygo/search/searchRoutes";
import codRoutes from "../routes/tizzygo/buynow/confirm-codRoutes";
import themeRoutes from "../routes/tizzygo/theme/theme";
import confirmOrderRouter from "../routes/tizzygo/buynow/confirm-codRoutes";
import orderRoutes from "../routes/tizzygo/orders/deliveryRoutes";
import yourorderRoutes from "../routes/tizzygo/orders/yourOrderRoutes";
import UserLocation from "../routes/tizzygo/locations/locationsRoutes";
import checkoutRoutes from "../routes/tizzygo/buynow/checkout";
import orderTrackingRoutes from "../routes/tizzygo/buynow/tracking/orderTrackingRoutes";

/* =========================================================
   EXPRESS APP
   ========================================================= */
const app = express();

/* =========================================================
   🔥🔥🔥 ZeptPay WEBHOOK — MUST BE FIRST 🔥🔥🔥
   ========================================================= */
app.use("/api/v0/payment/webhook", webhookRoutes);

/* =========================================================
   ❗ AFTER WEBHOOK — NORMAL BODY PARSERS
   ========================================================= */
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ extended: true, limit: "500mb" }));

/* =========================================================
   FILES & STATIC
   ========================================================= */

app.use("/images", express.static(path.join(process.cwd(), "public/images")));

/* =========================================================
   ✅ ROOT ROUTE - SOCKET CONNECTION KE LIYE IMPORTANT
   ========================================================= */
app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "TizzyGo API Server",
    version: "1.0.0",
    status: "Running",
    socketIO: {
      status: "Available",
      endpoint: "/socket.io/",
    },
    timestamp: new Date().toISOString(),
  });
});

/* =========================================================
   ROUTES
   ========================================================= */
app.use("/api/v0/auth", authRoutes);
app.use("/api/v0/fav", colorRoutes);
app.use("/api/v0/cart", cartRoutes);
app.use("/api/v0/shop", buynowShopRoutes);
app.use("/api/v0/comments", commentRoutes);
app.use("/api/v0/likes", likeRoutes);
app.use("/api/v0/rating-review", ratingRoutes);
app.use("/api/v0/shares", shareRoutes);
app.use("/api/v0/search", searchRoutes);
app.use("/api/v0/buyer", buynowRoutes);
app.use("/api/v0/cart", cartCheckoutRoutes);
app.use("/api/v0/payment", paymentRoutes);
app.use("/api/v0/payment", processPaymentRoutes);
app.use("/api/v0/payment", confirmOrderRouter);
app.use("/api/v0/payment", codRoutes);
app.use("/api/v0/user", themeRoutes);
app.use("/api/v0/orders/delivery", orderRoutes);
app.use("/api/v0/orders/yourorder", yourorderRoutes);
app.use("/api/v0/user/address", UserLocation);
app.use("/api/v0/checkout", checkoutRoutes);
app.use("/api/v0/checkout", orderTrackingRoutes);

/* =========================================================
   🕐 CRON JOB - Media Cleanup (Raat ko 12:00 AM Mumbai Time)
   ========================================================= */
cron.schedule(
  "0 0 * * *", // ✅ RAAT 12:00 AM - Midnight
  async () => {
    try {
      logger.info("🌙 Mumbai midnight cleanup job starting...");
      const startTime = Date.now();

      await runCleanupJob();

      const duration = Date.now() - startTime;
      logger.info(`✅ Mumbai midnight cleanup completed in ${duration}ms`);
    } catch (error) {
      logger.error("❌ Mumbai midnight cleanup job failed:", error);
    }
  },
  {
    timezone: "Asia/Kolkata", // ✅ Mumbai aur Kolkata dono ka same timezone
  },
);

logger.info(
  "⏰ Media cleanup scheduled: Every day at 12:00 AM Mumbai Time (IST)",
);

startCleanupScheduler();

logger.info(
  "⏰ Abandoned payment cleanup scheduled: Every 10 minutes (configurable via PAYMENT_TIMEOUT_MINUTES)",
);

/* =========================================================
   RUN ON STARTUP (Optional - sirf testing ke liye)
   ========================================================= */
// if (process.env.NODE_ENV === "development") {
//   setTimeout(() => {
//     runCleanupJob().catch(logger.error);
//   }, 5000);
// }

/* =========================================================
   HEALTH + FALLBACK
   ========================================================= */

app.get("/api/v0/health", (_req, res) => {
  res.status(200).json({
    success: true,
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/* =========================================================
   ❌ 404 FALLBACK - LAST MEIN HONA CHAHIYE
   ========================================================= */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.originalUrl}`,
    availableRoutes: {
      root: "/",
      health: "/api/v0/health",
    },
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.originalUrl}`,
  });
});

export default app;
