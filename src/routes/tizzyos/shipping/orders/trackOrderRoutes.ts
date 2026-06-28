// src/modules/tracking/tracking.routes.ts

import { Router } from "express";
import { TrackingController } from "../../../../controller/tizzyos/shipping/orders/trackOrderController";
import { authMiddleware } from "../../../../middleware/tizzygo/authMiddleware";

const router = Router();
const trackingController = new TrackingController();

// Proximity check - Rate limited to prevent abuse
router.get(
  "/proximity/:orderId",
  authMiddleware,
  trackingController.checkProximity.bind(trackingController),
);

// Live tracking - Higher rate limit for buyers
router.get(
  "/live/:orderId",
  authMiddleware,
  trackingController.getLiveTracking.bind(trackingController),
);

export default router;
