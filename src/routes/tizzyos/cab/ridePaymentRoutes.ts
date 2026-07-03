import { Router } from "express";
import {
  processPayment,
  getPaymentStatus,
  refundPayment,
} from "../../../controller/tizzyos/cab/ridePaymentController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = Router();

router.post("/payments/:bookingId/process", authMiddleware, processPayment);
router.get("/payments/:bookingId/status", authMiddleware, getPaymentStatus);
router.post("/payments/:bookingId/refund", authMiddleware, refundPayment);

export default router;
