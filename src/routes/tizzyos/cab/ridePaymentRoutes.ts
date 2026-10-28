import { Router } from "express";
import express from "express";

import {
  createOnlineOrder,
  verifyOnlinePayment,
  collectCashPayment,
  getPaymentStatus,
  paymentWebhook,
  refundPayment,
  cancelPayment,
} from "../../../controller/tizzyos/cab/ridePaymentController";

import { authMiddleware } from "../../../middleware/authMiddleware";

const router = Router();

/**
 * Razorpay webhook:
 * raw body is required for signature verification.
 * Keep this route BEFORE the router's JSON parser.
 */
router.post(
  "/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentWebhook,
);

// Parse JSON for all subsequent normal payment routes.
// This is needed because the router is mounted before app-level parsers.
router.use(express.json());

router.post(
  "/payments/:bookingId/order",
  authMiddleware,
  createOnlineOrder,
);

router.post(
  "/payments/:bookingId/verify",
  authMiddleware,
  verifyOnlinePayment,
);

router.post(
  "/payments/:bookingId/collect-cash",
  authMiddleware,
  collectCashPayment,
);

router.get(
  "/payments/:bookingId/status",
  authMiddleware,
  getPaymentStatus,
);

router.post(
  "/payments/:bookingId/refund",
  authMiddleware,
  refundPayment,
);

router.post(
  "/payments/:bookingId/cancel",
  authMiddleware,
  cancelPayment,
);

export default router;