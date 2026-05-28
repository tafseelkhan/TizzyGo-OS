import express from "express";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";
import { 
  updateRiderLocation, 
  getLiveTracking 
} from "../../../controller/tizzygo/orders/deliveryTrackingController";

const router = express.Router();

// Route 1: Update rider location (for delivery partners)
router.post("/location-update", authMiddleware, updateRiderLocation);

// Route 2: Get live tracking for customer
router.get("/live/:orderId", authMiddleware, getLiveTracking);

console.log('✅ Delivery tracking routes loaded successfully');

export default router;