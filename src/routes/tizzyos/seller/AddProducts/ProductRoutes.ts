import express from "express";
import {
  createProduct,
  getAllProducts,
  getUserProducts,
  getProductById,
  getProductDetailsForBuyNow,
} from "../../../../controller/tizzyos/seller/AddProducts/ProductController";
import { authMiddleware } from "../../../../middleware/authMiddleware";

const router = express.Router();

// POST
router.post("/products", authMiddleware, createProduct);

// 🔥 STATIC ROUTES FIRST — must come before /:id
router.get("/user", authMiddleware, getUserProducts);

// Root list
router.get("/", getAllProducts);

// More specific dynamic routes
router.get("/:productId/selected/:variantId", getProductDetailsForBuyNow);

// 🔥 GENERIC /:id LAST — always
router.get("/:id", getProductById);

export default router;