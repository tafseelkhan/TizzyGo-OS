import { Router } from "express";
import {
  getTracking,
  getTrackingByBooking,
  calculateMetrics,
} from "../../../controller/tizzyos/cab/rideTrackingController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = Router();

router.get("/tracking/:trackingId", authMiddleware, getTracking);
router.get(
  "/tracking/booking/:bookingId",
  authMiddleware,
  getTrackingByBooking,
);
router.post(
  "/tracking/:trackingId/calculate-metrics",
  authMiddleware,
  calculateMetrics,
);

export default router;
