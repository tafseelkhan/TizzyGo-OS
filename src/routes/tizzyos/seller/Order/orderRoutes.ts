import express from "express";
import { getSellerOrders } from "../../../../controller/tizzyos/orders/orderController"; // 👈 Apne hisab se path adjust kar lena
import { authMiddleware } from "../../../../middleware/tizzygo/authMiddleware";

const router = express.Router();

// 🔒 GET /api/seller/orders?sellerId=xxxx
router.get("/", authMiddleware, getSellerOrders);

export default router;