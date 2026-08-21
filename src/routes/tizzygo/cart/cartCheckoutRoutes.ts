import express from "express";
import {
  getCartCheckoutHandler,
  updateCartLocationHandler,
} from "../../../controller/tizzygo/cart/cartCheckoutController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = express.Router();

// ✅ GET /cart/checkout - Get cart checkout with location
router.get("/checkout", authMiddleware, getCartCheckoutHandler);

// ✅ POST /cart/checkout/location - Update location and recalculate
router.post("/checkout/location", authMiddleware, updateCartLocationHandler);

export default router;
