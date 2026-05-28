import express from "express";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";
import { confirmCOD } from "../../../controller/tizzygo/buynow/cod/orderController";

const router = express.Router();

// Sirf ek line! 😎
router.post("/confirm-cod", authMiddleware, confirmCOD);

export default router;
