import express from "express";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";
import { 
  processPaymentHandler, 
  getOrderStatusHandler 
} from "../../../controller/tizzygo/buynow/transactionController";

const router = express.Router();

// Route 1: Process payment (normal, QR, autopay)
router.post("/process-payment", authMiddleware, processPaymentHandler);

// Route 2: Get order status
router.get("/order-status/:orderId", authMiddleware, getOrderStatusHandler);

export default router;