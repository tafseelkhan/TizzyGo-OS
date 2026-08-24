import { Router } from "express";
import { getRideLiveTrackingController } from "../../../controller/tizzyos/cab/rideLiveTrackingController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = Router();

/**
 * GET /cab/ride/tracking/:bookingId
 *
 * Get initial tracking data for a ride
 *
 * Headers:
 *   Authorization: Bearer <token>
 *
 * Params:
 *   bookingId: string - The booking ID to track (e.g., RIDE-2026-001)
 *
 * Response:
 *   {
 *     success: boolean,
 *     data: {
 *       bookingId: string,
 *       trackingId?: string,
 *       rideCode: string,
 *       status: string,
 *       pickup: { latitude, longitude, address, googlePlaceId },
 *       destination: { latitude, longitude, address, googlePlaceId },
 *       driver: { userId, driverCode, location, heading, speed, ... },
 *       customer: { userId, location: { latitude, longitude, address, ... } }
 *     }
 *   }
 *
 * Errors:
 *   401 - Unauthorized
 *   403 - Not authorized to track this ride
 *   404 - Booking not found / Driver location not available
 *   400 - Ride is not in a trackable state
 *   500 - Server error
 */
router.get(
  "/connect/:bookingId/session/:trackingId",
  authMiddleware,
  getRideLiveTrackingController,
);

export default router;
