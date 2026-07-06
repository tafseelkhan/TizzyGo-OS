// routes/tizzyos/cab/rideRequestRoutes.ts

import { Router } from "express";
import {
  acceptRequest,
  rejectRequest,
  getBookingRequests,
  getDriverRequests,
  getPendingRequests,
  getRequestStats,
} from "../../../controller/tizzyos/cab/rideRequestController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = Router();

// =====================================================
// POST /api/ride/request/:requestId/accept
//
// Purpose:
// Accepts a ride request.
//
// Called By:
// Driver App
// =====================================================
router.post("/requests/:requestId/accept", authMiddleware, acceptRequest);

// =====================================================
// POST /api/ride/request/:requestId/reject
//
// Purpose:
// Rejects a ride request.
//
// Called By:
// Driver App
// =====================================================
router.post("/requests/:requestId/reject", authMiddleware, rejectRequest);

// =====================================================
// GET /api/ride/requests/booking/:bookingId
//
// Purpose:
// Retrieves all requests for a booking.
//
// Called By:
// Admin/Internal
// =====================================================
router.get("/requests/booking/:bookingId", authMiddleware, getBookingRequests);

// =====================================================
// GET /api/ride/requests/driver/all
//
// Purpose:
// Retrieves all requests for the authenticated driver.
//
// Called By:
// Driver App
// =====================================================
router.get("/requests/driver/all", authMiddleware, getDriverRequests);

// =====================================================
// GET /api/ride/requests/driver/pending
//
// Purpose:
// Retrieves pending requests for the authenticated driver.
//
// Called By:
// Driver App
// =====================================================
router.get("/requests/driver/pending", authMiddleware, getPendingRequests);

// =====================================================
// GET /api/ride/requests/stats/:bookingId
//
// Purpose:
// Retrieves request statistics for a booking.
//
// Called By:
// Admin/Internal
// =====================================================
router.get("/requests/stats/:bookingId", authMiddleware, getRequestStats);

export default router;
