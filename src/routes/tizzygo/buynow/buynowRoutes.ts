import express from "express";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";
import { checkout } from "../../../controller/tizzygo/buynow/buyerController";

const router = express.Router();

// Sirf ek line! 😎
router.get("/buy", authMiddleware, checkout);

export default router;