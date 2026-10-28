import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import cron from "node-cron";

import { runCleanupJob } from "../jobs/cronMediaCleanup";
import { startCleanupScheduler } from "../schedulers/cleanupScheduler";
import { logger } from "../utils/tizzyos/seller/logger";

import PayoutWebhookRoutes from "../routes/tizzyos/PayoutPortal/PayoutWebhookRoutes";
import ridePaymentRoutes from "../routes/tizzyos/cab/ridePaymentRoutes";

// 🔥 IMPORT PAYOUT PORTAL ROUTES
import PayoutPortalSetupRoutes from "../routes/tizzyos/PayoutPortal/PayoutPortalSetupRoutes";
import { processSellerEarnings } from "../jobs/sellerEarningSettlementJob";

import liveTrackingRoutes from "../routes/tizzyos/shipping/orders/deliveryTrackingRoutes";
import orderfetchRoutes from "../routes/tizzyos/shipping/orders/orderRoutes";

// TizzyOS Imports (If any) here
import sellerRoutes from "../routes/tizzyos/seller/sellerRoutes";
import sellerStatusRoutes from "../routes/tizzyos/seller/statusRoutes";
import riderRoutes from "../routes/tizzyos/rider/riderRoutes";
import adminRoutes from "../routes/tizzyos/rider/adminRoutes";
import storyRoutes from "../routes/tizzyos/story/storyRoutes";
import priceCalculationRoutes from "../routes/tizzyos/seller/AddProducts/pricingCalculationRoutes";
import createProductsRoutes from "../routes/tizzyos/seller/AddProducts/ProductRoutes";
import category from "../routes/tizzyos/category";
import uploadRoutes from "../routes/tizzyos/seller/AddProducts/uploadRoutes";
import deleteProduct from "../routes/tizzyos/Products/ProductRoutes";
import themesRoutes from "../routes/tizzyos/theme/theme";
import ordersRoutes from "../routes/tizzyos/shipping/orders/orderRoutes";
import shipregisterRoutes from "../routes/tizzyos/shipping/fws/fwsRegisterRoutes";
import onlineRoutes from "../routes/tizzyos/shipping/fws/fwsRiderOnlineRoutes";
import riderIdRoutes from "../routes/tizzyos/shipping/fws/fwsSearchRiderIdRoutes";
import getRiderLocationRoutes from "../routes/tizzyos/shipping/fws/fwsRiderLocationRoutes";
import deliveryTrackingRoutes from "../routes/tizzyos/shipping/orders/deliveryTrackingRoutes";
import sellerLocation from "../routes/tizzyos/seller/locations/locationsRoutes";
import getTrackingStatusRoutes from "../routes/tizzyos/shipping/orders/trackingStatus";
import trackOrderRoutes from "../routes/tizzyos/shipping/orders/trackOrderRoutes";
import fwsApplicationRoutes from "../routes/tizzyos/fws/fwsApplicationRoutes";
import fwsemployeeRoutes from "../routes/tizzyos/fws/employeeRoutes";
import deliverWithOTPRoutes from "../routes/tizzyos/shipping/orders/deliverdWithOTPRoutes";
import rideVehicleCategoryRoutes from "../routes/tizzyos/cab/rideVehicleCatigory";
import rideRegisterRoutes from "../routes/tizzyos/cab/registerRideDriver";
import driverOnlineDriverRoutes from "../routes/tizzyos/cab/rideOnlineDriver";
import rideLocationDriverRoutes from "../routes/tizzyos/cab/rideLocationRoutes";
import rideBookingRoutes from "../routes/tizzyos/cab/rideBookingRoutes";
import rideTypesRoutes from "../routes/tizzyos/cab/rideTypeRoutes";
import rideTrackingRoutes from "../routes/tizzyos/cab/rideTrackingRoutes";
import rideRequestRoutes from "../routes/tizzyos/cab/rideRequestRoutes";
import rideLiveTrackingRoutes from "../routes/tizzyos/cab/rideLiveTrackingRoutes";
import sellerEarningRoutes from "../routes/tizzyos/PayoutPortal/SellerEarningRoutes";
import CabQRScanner from "../routes/tizzyos/cab/rideQRScanRoutes";

/* =========================================================
   EXPRESS APP
   ========================================================= */
const app = express();

/* =========================================================
   RAZORPAYX WEBHOOK
   MUST BE BEFORE GLOBAL BODY PARSERS
   ========================================================= */

app.use("/api/v0/payout-portal", PayoutWebhookRoutes);

// Cab/Ride Razorpay payment routes.
// Its webhook uses express.raw() inside the router.
app.use("/api/v0/ride", ridePaymentRoutes);

/* =========================================================
   ❗ AFTER WEBHOOK — NORMAL BODY PARSERS
   ========================================================= */
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ extended: true, limit: "500mb" }));

/* =========================================================
    PAYOUT PORTAL ROUTES
   ========================================================= */
app.use("/api/v0/payout-portal", PayoutPortalSetupRoutes);

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
    name: "TizzyOS API Server",
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
   ROUTES // TizzyOS Routes
   ========================================================= */
app.use("/api/v0/orders/tracking", liveTrackingRoutes);
app.use("/api/v0/orders", orderfetchRoutes);
app.use("/api/v0/seller", sellerRoutes);
app.use("/api/v0/seller", sellerStatusRoutes);
app.use("/api/v0/rider", riderRoutes);
app.use("/api/v0/admin", adminRoutes);
app.use("/api/v0/stories", storyRoutes);
app.use("/api/v0/seller/product", priceCalculationRoutes);
app.use("/api/v0/seller/forms/categories", createProductsRoutes);
app.use("/api/v0/categories", category);
app.use("/api/v0/upload", uploadRoutes);
app.use("/api/v0/delete", deleteProduct);
app.use("/api/v0/user", themesRoutes);
app.use("/api/v0/seller/orders", ordersRoutes);
app.use("/api/v0/shipping", shipregisterRoutes);
app.use("/api/v0/shipper", onlineRoutes);
app.use("/api/v0/rider", riderIdRoutes);
app.use("/api/v0/track", getRiderLocationRoutes);
app.use("/api/v0/tracking", getTrackingStatusRoutes);
app.use("/api/v0/delivery/tracking", deliveryTrackingRoutes);
app.use("/api/v0/user/address", sellerLocation);
app.use("/api/v0/find", trackOrderRoutes);
app.use("/api/v0/fws/warehouse", fwsApplicationRoutes);
app.use("/api/v0/fws/employee", fwsemployeeRoutes);
app.use("/api/v0/buyer/order", deliverWithOTPRoutes);
app.use("/api/v0/driver", rideVehicleCategoryRoutes);
app.use("/api/v0/cab", rideRegisterRoutes);
app.use("/api/v0/available", driverOnlineDriverRoutes);
app.use("/api/v0/update", rideLocationDriverRoutes);
app.use("/api/v0/ride", rideBookingRoutes);
app.use("/api/v0", rideTypesRoutes);
app.use("/api/v0/ride", rideTrackingRoutes);
app.use("/api/v0/ride", rideRequestRoutes);
app.use("/api/v0/ride/live/tracking", rideLiveTrackingRoutes);
app.use("/api/v0/seller-earnings", sellerEarningRoutes);
app.use("/api/v0/ride", CabQRScanner);

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

cron.schedule("0 */2 * * *", async () => {
  await processSellerEarnings();
});

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

app.get("/health", (_req, res) => {
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
      health: "/health",
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
