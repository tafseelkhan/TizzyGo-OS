// routes/delivery.ts

import express from "express";
import { authMiddleware } from "../../../../middleware/tizzygo/authMiddleware";
import {
  initiateDelivery,
  deliverWithOTP,
  requestNewOTP,
  verifyDeliveryOTP,
} from "../../../../controller/tizzyos/shipping/orders/deliveredWithOTP";

const router = express.Router();

// 🔥 NEW: Initiate delivery - Generate OTP and send email
router.post("/initiate-delivery", authMiddleware, initiateDelivery);

// Verify OTP and complete delivery
router.post("/deliver-with-otp", authMiddleware, deliverWithOTP);

// Request new OTP
router.post("/request-otp", authMiddleware, requestNewOTP);

// Verify OTP (GET)
router.get("/verify-otp", authMiddleware, verifyDeliveryOTP);

export default router;
