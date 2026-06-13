import express from "express";
import {
  registerShipping,
  getPendingShipping,
  updateShippingStatus,
  getShippingById,
  checkShippingForm,
  getApprovedShippingRiders,
  setRiderOnlineOffline,
} from "../../../../controller/tizzyos/shipping/fws/fwsRegisterController";
import { authMiddleware } from "../../../../middleware/tizzygo/authMiddleware";

const router = express.Router();

// Rider submit
router.post("/register", authMiddleware, registerShipping);

// Get all approved riders (random order)
router.get("/available-shipping", getApprovedShippingRiders);

// Set rider online/offline (private)
router.post("/shipping/online-offline", authMiddleware, setRiderOnlineOffline);

// Get shipping by ID (private)
router.get("/:shippingId", authMiddleware, getShippingById);

// 🔐 Private – token required
router.get("/form/check", authMiddleware, checkShippingForm);

// Admin: list pending riders
router.get("/pending", getPendingShipping);

// Admin: approve/reject rider
router.patch("/:riderId/status", updateShippingStatus);

export default router;
