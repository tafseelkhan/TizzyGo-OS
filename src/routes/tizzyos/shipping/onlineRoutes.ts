import express from "express";
import {
  riderOnlineStatusController,
} from "../../../controller/tizzyos/shipping/riderOnlineStatusController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware"; // Make sure this exists

const router = express.Router();

// Rider sets their online/offline status
router.post("/shipper/online-status", authMiddleware, riderOnlineStatusController);

export default router;