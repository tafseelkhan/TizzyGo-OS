import express from "express";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";
import { getOrderById } from "../../../controller/tizzygo/orders/orderFetchController";

const router = express.Router();

// Sirf ek line! 😎
router.get("/:orderId", authMiddleware, getOrderById);

console.log("✅ Order fetch routes loaded successfully");

export default router;
