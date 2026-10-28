import express from "express";
import { getSellerApplicationStatus } from "../../../controller/tizzyos/seller/statusController";
import { authMiddleware } from "../../../middleware/authMiddleware";

const router = express.Router();

router.get("/status", authMiddleware, getSellerApplicationStatus);

export default router;
