import express from 'express';
import { authMiddleware } from '../../../middleware/tizzygo/authMiddleware';
import {
  getMyOrdersFull,
  getOrderByMongoId,
} from '../../../controller/tizzygo/orders/yourorderController';

const router = express.Router();

/**
 * 🧾 API 1: My Orders (FULL DATA)
 * GET /api/orders/my
 */
router.get('/my', authMiddleware, getMyOrdersFull);

/**
 * 📦 API 2: Single Order by Mongo _id (FULL DATA)
 * GET /api/orders/by-id/:orderMongoId
 */
router.get('/by-id/:orderMongoId', authMiddleware, getOrderByMongoId);

export default router;
