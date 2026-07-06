// routes/tizzyos/cab/driverStatusRoutes.ts

import { Router } from "express";
import {
  updateDriverOnlineStatus,
  getDriverStatus,
  bulkUpdateDriverStatus,
  getAllOnlineDrivers,
  toggleDriverStatus,
  getOnlineDriversCount,
  cleanupStaleStatuses,
} from "../../../controller/tizzyos/cab/riderOnlineDriverController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = Router();

// ✅ Driver Online/Offline - Main API
router.put("/driver/online-status", authMiddleware, updateDriverOnlineStatus);

// ✅ Get Current Driver Status
router.get("/driver/status", authMiddleware, getDriverStatus);

// ✅ Toggle Driver Status
router.put("/driver/toggle-status", authMiddleware, toggleDriverStatus);


// ✅ Get All Online Drivers (Admin only)
router.get(
  "/drivers/online",
  authMiddleware,
  getAllOnlineDrivers,
);

// ✅ Get Online Drivers Count
router.get("/drivers/online/count", authMiddleware, getOnlineDriversCount);

// ✅ Bulk Update (Admin only)
router.put(
  "/drivers/bulk-status",
  authMiddleware,
  bulkUpdateDriverStatus,
);

// ✅ Cleanup Stale Statuses (Admin only)
router.delete(
  "/drivers/cleanup",
  authMiddleware,
  cleanupStaleStatuses,
);

export default router;
