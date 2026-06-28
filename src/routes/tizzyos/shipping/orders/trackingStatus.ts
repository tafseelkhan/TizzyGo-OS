import { Router } from "express";
import { getTrackingStatus } from "../../../../controller/tizzyos/shipping/orders/trackingStatus";
import { authMiddleware } from "../../../../middleware/tizzygo/authMiddleware";

const router = Router();

router.get("/history/status", authMiddleware, getTrackingStatus);

export default router;
