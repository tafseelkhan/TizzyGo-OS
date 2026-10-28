import express from "express";
import { deleteProduct } from "../../../controller/tizzyos/Products/ProductController";
import { authMiddleware } from "../../../middleware/authMiddleware";

const router = express.Router();

router.get("/product", authMiddleware, deleteProduct);

export default router;
