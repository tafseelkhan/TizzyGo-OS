import express from "express";
import {
  assignRiderToOrder,
  riderAcceptOrder,
  riderConfirmPickup,
  riderConfirmDelivery,
  getRiderPendingOrders,
} from "../../../../controller/tizzyos/shipping/fws/fwsRiderController";
import { authMiddleware } from "../../../../middleware/tizzygo/authMiddleware"; // Make sure this exists

const router = express.Router();

// ================== RIDER ASSIGNMENT ==================

// Assign a rider to an order (auto or manual)
router.post("/assign-rider", authMiddleware, assignRiderToOrder);

// Rider accepts the assigned order
router.post("/rider/accept", authMiddleware, riderAcceptOrder);

// Rider confirms pickup
router.post("/rider/pickup", authMiddleware, riderConfirmPickup);

// Rider confirms delivery
router.post("/rider/deliver", authMiddleware, riderConfirmDelivery);

// ================== RIDER ORDERS ==================

// Get all pending orders for a rider
router.get("/rider/:riderId/pending-orders", authMiddleware, getRiderPendingOrders);

export default router;
