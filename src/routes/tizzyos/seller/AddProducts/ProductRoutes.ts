import express from "express";
import {
  createProduct,
  getAllProducts,
  getUserProducts,
  getProductById,
  getProductDetailsForBuyNow,
} from "../../../../controller/tizzyos/seller/AddProducts/ProductController";
import { authMiddleware } from "../../../../middleware/tizzygo/authMiddleware";

const router = express.Router(); // ✅ Express router only

// POST /api/products → create new product
router.post("/products", authMiddleware, createProduct);

// GET → all products (public)
router.get("/", getAllProducts);

router.get("/:productId/selected/:variantId", getProductDetailsForBuyNow);

router.get("/:id", getProductById);

// GET → products of authenticated user
router.get("/user", authMiddleware, getUserProducts);

export default router;