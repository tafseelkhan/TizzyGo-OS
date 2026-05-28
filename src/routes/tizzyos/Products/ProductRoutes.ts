import express from "express";
import { deleteProduct } from "../../../controller/tizzyos/Products/ProductController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = express.Router();

router.get("/product", authMiddleware, deleteProduct);

export default router;
