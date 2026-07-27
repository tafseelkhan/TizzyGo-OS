import express from "express";
import { webhookHandler } from "../../../controller/tizzygo/buynow/webhookController";

const router = express.Router();

// Razorpay webhook endpoint
// ✅ CRITICAL: Use express.raw() for webhook (BEFORE json parser)
// This preserves the raw body for signature verification
router.post(
  "/razorpay",
  express.raw({ type: "application/json" }),
  webhookHandler
);

export default router;
