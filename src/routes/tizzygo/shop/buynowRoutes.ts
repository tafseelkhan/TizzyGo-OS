import express from "express";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";
import {
  buyNowHandler,
  getBuyNowItemHandler,
  clearBuyNowHandler,
} from "../../../controller/tizzygo/shop/buynowController";

const router = express.Router();

// Buy Now Flow
router.post("/buy-now", authMiddleware, buyNowHandler);                   // Buy now
router.get("/buynow-item", authMiddleware, getBuyNowItemHandler);         // Get buy now item
router.delete("/clear-buynow", authMiddleware, clearBuyNowHandler);       // Clear buy now

export default router;