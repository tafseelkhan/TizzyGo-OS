import express from "express"; 
import Order from "../../../../models/tizzyos/shipping/order/order"; // Buyer backend Order model
import { authMiddleware } from "../../../../middleware/tizzygo/authMiddleware";

const router = express.Router();

// GET /api/orders?sellerId=xxxxx
router.get("/", authMiddleware, async (req, res) => {
  try {
    const sellerId = req.query.sellerId;
    console.log("Fetching orders for sellerId:", sellerId);

    if (!sellerId)
      return res.status(400).json({ message: "sellerId required" });

    const orders = await Order.find({ sellerId })
      .sort({ createdAt: -1 })
      .lean();
    console.log(`Found ${orders.length} orders for sellerId ${sellerId}`);

    return res.json({ success: true, orders });
  } catch (err: any) {
    console.error("Buyer backend fetch orders error:", err);
    return res.status(500).json({ message: "Failed to fetch orders" });
  }
});

export default router;
