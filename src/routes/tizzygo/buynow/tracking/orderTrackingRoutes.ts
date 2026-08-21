// src/routes/orderTrackingRoutes.ts

import { Router } from "express";
import { OrderTrackingController } from "../../../../controller/tizzygo/buynow/tracking/orderTrackingController";
import { authMiddleware } from "../../../../middleware/tizzygo/authMiddleware";

const router = Router();
const controller = new OrderTrackingController();

router.get(
  "/order-tracking/:orderId",
  authMiddleware,
  controller.getTrackingData.bind(controller),
);

export default router;
