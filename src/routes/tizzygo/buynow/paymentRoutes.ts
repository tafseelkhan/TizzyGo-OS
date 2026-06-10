import express from "express";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";
import {
  createPaymentIntentHandler,
  getSessionStatusHandler,
} from "../../../controller/tizzygo/buynow/paymentController";

const router = express.Router();

// Route 1: Create payment intent (COD or Online)
router.post(
  "/create-payment-intent",
  authMiddleware,
  createPaymentIntentHandler,
);

// Route 2: Get session status
router.get(
  "/session-status/:checkoutSessionId",
  authMiddleware,
  getSessionStatusHandler,
);

export default router;
