// routes/tizzyos/cab/rideTrackingRoutes.ts

import { Router } from "express";
import {
  getTracking,
  getTrackingByBooking,
  calculateMetrics,
  updateRideStatus,
  getActiveTracking,
} from "../../../controller/tizzyos/cab/rideTrackingController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = Router();

// =====================================================
// GET /api/ride/tracking/:trackingId
//
// Purpose:
// Retrieves tracking data by tracking ID.
//
// Called By:
// Customer Frontend, Driver App
// =====================================================
router.get("/tracking/:trackingId", authMiddleware, getTracking);

// =====================================================
// GET /api/ride/tracking/booking/:bookingId
//
// Purpose:
// Retrieves tracking data by booking ID.
//
// Called By:
// Customer Frontend, Driver App
// =====================================================
router.get(
  "/tracking/booking/:bookingId",
  authMiddleware,
  getTrackingByBooking,
);

// =====================================================
// POST /api/ride/tracking/:trackingId/calculate-metrics
//
// Purpose:
// Calculates trip metrics.
//
// Called By:
// Customer Frontend, Driver App
// =====================================================
router.post(
  "/tracking/:trackingId/calculate-metrics",
  authMiddleware,
  calculateMetrics,
);

// =====================================================
// PUT /api/ride/tracking/:trackingId/status
//
// Purpose:
// Updates ride status.
//
// Called By:
// Driver App, Internal
// =====================================================
router.put("/tracking/:trackingId/status", authMiddleware, updateRideStatus);

// =====================================================
// GET /api/ride/tracking/active
//
// Purpose:
// Retrieves active tracking for the authenticated user.
//
// Called By:
// Customer Frontend, Driver App
// =====================================================
router.get("/tracking/active", authMiddleware, getActiveTracking);

export default router;
