// ============================================================
// routes/tizzygo/checkout.ts
// ============================================================

import express from "express";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";
import { getOrderConfirmation } from "../../../controller/tizzygo/buynow/orderConfirmationController";

const router = express.Router();

// ✅ GET order confirmation
router.get(
  "/order-confirmation/:checkoutSessionId",
  authMiddleware,
  getOrderConfirmation,
);

export default router;
