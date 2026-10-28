import express from "express";
import { razorpayXPayoutWebhook } from "../../../controller/tizzyos/PayoutPortal/PayoutPortalSetupController";
import { authMiddleware } from "../../../middleware/authMiddleware";

const router = express.Router();

// ======================================================
// RAZORPAYX WEBHOOK (NO AUTH — RazorpayX calls this)
// ======================================================

router.post("/razorpayx/webhook/payout", authMiddleware, razorpayXPayoutWebhook);

export default router;
