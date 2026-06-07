(global as any).__DEV__ = process.env.NODE_ENV !== "production";

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";

// 🔥 IMPORT WEBHOOK FIRST
import webhookRoutes from "./routes/tizzygo/buynow/webhookRoutes";

import authRoutes from "./routes/tizzygo/auths/authRoutes";
import colorRoutes from "./routes/tizzygo/auths/colorRoutes";
import cartRoutes from "./routes/tizzygo/cart/addToCartRoutes";
import buynowShopRoutes from "./routes/tizzygo/shop/buynowRoutes";
import commentRoutes from "./routes/tizzygo/social/commentRoutes";
import likeRoutes from "./routes/tizzygo/social/likeRoutes";
import ratingRoutes from "./routes/tizzygo/social/ratingRoutes";
import profileRoutes from "./routes/tizzygo/profile/profileRoutes";
import shareRoutes from "./routes/tizzygo/social/shareRoutes";
import buynowRoutes from "./routes/tizzygo/buynow/buynowRoutes";
import paymentRoutes from "./routes/tizzygo/buynow/paymentRoutes";
import processPaymentRoutes from "./routes/tizzygo/buynow/process-paymentRoutes";
import searchRoutes from "./routes/tizzygo/search/searchRoutes";
import codRoutes from "./routes/tizzygo/buynow/confirm-codRoutes";
import themeRoutes from "./routes/tizzygo/theme/theme";
import confirmOrderRouter from "./routes/tizzygo/buynow/confirm-codRoutes";
import orderRoutes from "./routes/tizzygo/orders/deliveryRoutes";
import liveTrackingRoutes from "./routes/tizzygo/orders/deliveryTrackingRoutes";
import orderfetchRoutes from "./routes/tizzygo/orders/orderRoutes";
import yourorderRoutes from "./routes/tizzygo/orders/yourOrderRoutes";

// TizzyOS Imports (If any) here
import userRoutes from "./routes/tizzyos/user/meRoutes";
import sellerRoutes from "./routes/tizzyos/seller/sellerRoutes";
import sellerStatusRoutes from "./routes/tizzyos/seller/statusRoutes";
import riderRoutes from "./routes/tizzyos/rider/riderRoutes";
import adminRoutes from "./routes/tizzyos/rider/adminRoutes";
import storyRoutes from "./routes/tizzyos/story/storyRoutes";
import createProductsRoutes from "./routes/tizzyos/seller/AddProducts/ProductRoutes";
import category from "./routes/tizzyos/category";
import uploadRoutes from "./routes/tizzyos/seller/AddProducts/uploadRoutes";
import deleteProduct from "./routes/tizzyos/Products/ProductRoutes";
import themesRoutes from "./routes/tizzyos/theme/theme";
import ordersRoutes from "./routes/tizzyos/seller/Order/orderRoutes";
import shipregisterRoutes from "./routes/tizzyos/shipping/registerRoutes";
import Shipper from "./routes/tizzyos/shipping/shipperRoutes";
import onlineRoutes from "./routes/tizzyos/shipping/onlineRoutes";
import riderIdRoutes from "./routes/tizzyos/shipping/searchRiderIdRoutes";
import getRiderLocationRoutes from "./routes/tizzyos/shipping/riderLocationRoutes";
// import sellerPaymentRoutes from "./routes/tizzyos/seller/PayOut/Portal/wallet";
import walletSetupRoutes from "./routes/tizzyos/seller/PayOut/walletSetupRoutes";

/* =========================================================
   EXPRESS APP
   ========================================================= */
const app = express();

/* =========================================================
   🔥🔥🔥 ZeptPay WEBHOOK — MUST BE FIRST 🔥🔥🔥
   ========================================================= */
app.use("/api/payment/webhook", webhookRoutes);

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
   ROUTES
   ========================================================= */
app.use("/api/profile", profileRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/fav", colorRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/shop", buynowShopRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/likes", likeRoutes);
app.use("/api/rating-review", ratingRoutes);
app.use("/api/shares", shareRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/buyer", buynowRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/payment", processPaymentRoutes);
app.use("/api/payment", confirmOrderRouter);
app.use("/api/payment", codRoutes);
app.use("/api/user", themeRoutes);
app.use("/api/orders/delivery", orderRoutes);
app.use("/api/orders/tracking", liveTrackingRoutes);
app.use("/api/orders", orderfetchRoutes);
app.use("/api/orders/yourorder", yourorderRoutes);

// TizzyOS Routes
app.use("/api/user", userRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/seller", sellerStatusRoutes);
app.use("/api/rider", riderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/seller/forms/categories", createProductsRoutes);
app.use("/api/categories", category);
app.use("/api/upload", uploadRoutes);
app.use("/api/delete", deleteProduct);
app.use("/api/user", themesRoutes);
app.use("/api/seller/orders", ordersRoutes);
app.use("/api/shipping", shipregisterRoutes);
app.use("/api/shipping", Shipper);
app.use("/api", onlineRoutes);
app.use("/api", riderIdRoutes);
app.use("/api/track", getRiderLocationRoutes);
// app.use("/api/payout-portal/wallet", sellerPaymentRoutes);
app.use("/api/payout-portal/wallet-setup", walletSetupRoutes);

/* =========================================================
   HEALTH + FALLBACK
   ========================================================= */
app.get("/health", (_req, res) => res.status(200).send("OK"));

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.originalUrl}`,
  });
});

export default app;
