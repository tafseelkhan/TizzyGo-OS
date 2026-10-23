import { Router } from "express";

import {
  createSellerEarning,
  getSellerEarnings,
} from "../../../controller/tizzyos/PayoutPortal/SellerEarningController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = Router();

/**
 * Create seller earning from a captured order
 *
 * POST /api/v0/seller-earnings
 */
router.post("/", createSellerEarning);

/**
 * Get seller earnings
 *
 * GET /api/v0/seller-earnings?sellerId=SELLER_ID
 *
 * Optional:
 * ?status=HOLDING
 * ?status=PAYOUT_AVAILABLE
 * ?status=WALLET_AVAILABLE
 */
router.get("/", authMiddleware, getSellerEarnings);

export default router;