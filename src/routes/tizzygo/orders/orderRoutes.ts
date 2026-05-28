import express from "express"; 
import Order from "../../../models/tizzygo/order/order"; // Buyer backend Order model
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

// 🔐 Middleware for service token auth
const serviceAuthMiddleware = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const SERVICE_TOKEN = process.env.SELLER_BACKEND_SERVICE_TOKEN;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("Service auth failed: No token provided");
    return res.status(401).json({ success: false, message: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];
  if (token !== SERVICE_TOKEN) {
    console.log("Service auth failed: Invalid token", token);
    return res.status(403).json({ success: false, message: "Forbidden: Invalid service token" });
  }

  console.log("Service auth passed");
  next();
};

// GET /api/orders?sellerId=xxxxx
router.get("/", serviceAuthMiddleware, async (req, res) => {
  try {
    const sellerId = req.query.sellerId;
    console.log("Fetching orders for sellerId:", sellerId);

    if (!sellerId) return res.status(400).json({ message: "sellerId required" });

    const orders = await Order.find({ sellerId }).sort({ createdAt: -1 }).lean();
    console.log(`Found ${orders.length} orders for sellerId ${sellerId}`);

    return res.json({ success: true, orders });
  } catch (err: any) {
    console.error("Buyer backend fetch orders error:", err);
    return res.status(500).json({ message: "Failed to fetch orders" });
  }
});

export default router;
