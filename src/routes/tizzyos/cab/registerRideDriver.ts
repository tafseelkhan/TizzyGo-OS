import { Router } from "express";
import {
  registerRideDriver,
  getRideDriver,
} from "../../../controller/tizzyos/cab/registerRideDriver";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = Router();

// ============================================
// 🚗 CAB/DRIVER ROUTES
// ============================================

/**
 * @route   POST /api/cab/driver
 * @desc    Register a new ride driver
 * @access  Private (User)
 * @body    { licenceNumber, licenceExpiryDate, licenceFront, licenceBack, ... }
 */
router.post("/driver/register", authMiddleware, registerRideDriver);

/**
 * @route   GET /api/cab/driver
 * @desc    Get current user's driver profile
 * @access  Private (User)
 */
router.get("/driver", authMiddleware, getRideDriver);

export default router;
