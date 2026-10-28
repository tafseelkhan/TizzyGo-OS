import express from "express";
import { riderLocationController } from "../../../../controller/tizzyos/shipping/fws/fwsRiderLocationController";
import { authMiddleware } from "../../../../middleware/authMiddleware"; // Make sure this exists

const router = express.Router();

// ================== RIDER LOCATION ==================

// Start/stop/update/get rider location
router.post("/rider/location", authMiddleware, riderLocationController);

export default router;
