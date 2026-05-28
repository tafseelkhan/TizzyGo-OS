import express from "express";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";
import {
  addToCartHandler,
  updateQuantityHandler,
  removeFromCartHandler,
  checkProductInCartHandler,
  getUserCartHandler,
  cartCountHandler,
} from "../../../controller/tizzygo/cart/cartController";

const router = express.Router();

// Cart Management
router.post("/add", authMiddleware, addToCartHandler);                    // Add to cart
router.put("/update", authMiddleware, updateQuantityHandler);             // Update quantity
router.delete("/remove", authMiddleware, removeFromCartHandler);          // Remove from cart
router.get("/check", authMiddleware, checkProductInCartHandler);          // Check product in cart
router.get("/user/cart", authMiddleware, getUserCartHandler);             // Get user cart
router.get("/count", authMiddleware, cartCountHandler);                   // Get cart count

export default router;