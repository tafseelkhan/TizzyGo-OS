import { Request, Response } from "express";
import { getRideLiveTracking } from "../../../services/tizzyos/cab/rideLiveTrackingService";

// ============================================================
// ERROR MESSAGES MAP
// ============================================================

const ERROR_MESSAGES: Record<string, { status: number; message: string }> = {
  BOOKING_ID_REQUIRED: {
    status: 400,
    message: "Booking ID is required"
  },
  TRACKING_ID_REQUIRED: {
    status: 400,
    message: "Tracking ID is required"
  },
  BOOKING_NOT_FOUND: {
    status: 404,
    message: "Booking not found"
  },
  UNAUTHORIZED: {
    status: 403,
    message: "You are not authorized to track this ride"
  },
  NO_DRIVER_ASSIGNED: {
    status: 404,
    message: "No driver assigned to this ride"
  },
  RIDE_NOT_TRACKABLE: {
    status: 400,
    message: "Ride is not in a trackable state. Please wait for driver assignment."
  },
  RIDE_ALREADY_COMPLETED: {
    status: 400,
    message: "This ride has already been completed or cancelled"
  }
};

// ============================================================
// CONTROLLER
// ============================================================

export const getRideLiveTrackingController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const startTime = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // ============================================================
  // LOG: Request Started
  // ============================================================
  console.log(`📡 [LiveTracking] ========================================`);
  console.log(`📡 [LiveTracking] 🚀 REQUEST STARTED [${requestId}]`);
  console.log(`📡 [LiveTracking] 📍 Method: ${req.method}`);
  console.log(`📡 [LiveTracking] 📍 URL: ${req.originalUrl}`);
  console.log(`📡 [LiveTracking] 📍 IP: ${req.ip || req.connection?.remoteAddress || 'unknown'}`);
  console.log(`📡 [LiveTracking] 📍 User-Agent: ${req.headers['user-agent'] || 'unknown'}`);

  try {
    // ============================================================
    // LOG: Authentication Check
    // ============================================================
    console.log(`📡 [LiveTracking] 🔐 [${requestId}] Checking authentication...`);

    // 1. Get authenticated user
    const userId = (req as any).user?.id;

    if (!userId) {
      console.warn(`📡 [LiveTracking] ⚠️ [${requestId}] No userId found in request - UNAUTHORIZED`);
      console.log(`📡 [LiveTracking] ========================================`);
      res.status(401).json({
        success: false,
        message: "Unauthorized. Please login again."
      });
      return;
    }

    console.log(`📡 [LiveTracking] ✅ [${requestId}] Authenticated user: ${userId}`);

    // ============================================================
    // LOG: Params Extraction
    // ============================================================
    console.log(`📡 [LiveTracking] 📦 [${requestId}] Extracting params...`);

    // 2. Get booking ID & tracking ID from URL params
    const { bookingId, trackingId } = req.params;

    console.log(`📡 [LiveTracking] 📦 [${requestId}] bookingId: ${bookingId || 'MISSING'}`);
    console.log(`📡 [LiveTracking] 📦 [${requestId}] trackingId: ${trackingId || 'MISSING'}`);

    // ============================================================
    // LOG: Validate Params
    // ============================================================
    console.log(`📡 [LiveTracking] 🔍 [${requestId}] Validating params...`);

    if (!bookingId || bookingId.trim() === "") {
      console.warn(`📡 [LiveTracking] ⚠️ [${requestId}] Booking ID is missing or empty`);
      console.log(`📡 [LiveTracking] ========================================`);
      res.status(400).json({
        success: false,
        message: "Booking ID is required"
      });
      return;
    }

    console.log(`📡 [LiveTracking] ✅ [${requestId}] Booking ID valid: ${bookingId}`);

    if (!trackingId || trackingId.trim() === "") {
      console.warn(`📡 [LiveTracking] ⚠️ [${requestId}] Tracking ID is missing or empty`);
      console.log(`📡 [LiveTracking] ========================================`);
      res.status(400).json({
        success: false,
        message: "Tracking ID is required"
      });
      return;
    }

    console.log(`📡 [LiveTracking] ✅ [${requestId}] Tracking ID valid: ${trackingId}`);

    // ============================================================
    // LOG: Service Call
    // ============================================================
    console.log(`📡 [LiveTracking] 🔄 [${requestId}] Calling service with:`);
    console.log(`📡 [LiveTracking]    bookingId: ${bookingId}`);
    console.log(`📡 [LiveTracking]    trackingId: ${trackingId}`);
    console.log(`📡 [LiveTracking]    userId: ${userId}`);
    console.log(`📡 [LiveTracking]    includeCachedLocation: false`);

    const serviceStartTime = Date.now();

    // 3. Call service with BOTH IDs
    const result = await getRideLiveTracking({
      bookingId,
      trackingId,
      userId,
      includeCachedLocation: false,
    });

    const serviceEndTime = Date.now();
    const serviceDuration = serviceEndTime - serviceStartTime;

    console.log(`📡 [LiveTracking] ✅ [${requestId}] Service completed in ${serviceDuration}ms`);

    // ============================================================
    // LOG: Response Data Summary
    // ============================================================
    console.log(`📡 [LiveTracking] 📊 [${requestId}] Response data summary:`);
    console.log(`📡 [LiveTracking]    bookingId: ${result.bookingId}`);
    console.log(`📡 [LiveTracking]    trackingId: ${result.trackingId || 'N/A'}`);
    console.log(`📡 [LiveTracking]    rideCode: ${result.rideCode}`);
    console.log(`📡 [LiveTracking]    status: ${result.status}`);
    console.log(`📡 [LiveTracking]    driverId: ${result.driver?.userId || 'N/A'}`);
    console.log(`📡 [LiveTracking]    hasDriverLocation: ${result.driver?.location ? 'YES' : 'NO'}`);
    console.log(`📡 [LiveTracking]    customerId: ${result.customer?.userId || 'N/A'}`);
    console.log(`📡 [LiveTracking]    hasCustomerLocation: ${result.customer?.location ? 'YES' : 'NO'}`);

    // ============================================================
    // LOG: Calculate Total Duration
    // ============================================================
    const totalDuration = Date.now() - startTime;
    console.log(`📡 [LiveTracking] ⏱️ [${requestId}] Total request duration: ${totalDuration}ms`);
    console.log(`📡 [LiveTracking] ✅ [${requestId}] SUCCESS - Sending response`);
    console.log(`📡 [LiveTracking] ========================================`);

    // 4. Send success response
    res.status(200).json({
      success: true,
      message: "Tracking data retrieved successfully",
      data: result
    });

  } catch (error: any) {
    // ============================================================
    // LOG: Error Occurred
    // ============================================================
    const totalDuration = Date.now() - startTime;
    console.error(`📡 [LiveTracking] ❌ [${requestId}] ERROR occurred after ${totalDuration}ms`);
    console.error(`📡 [LiveTracking] ❌ [${requestId}] Error name: ${error.name || 'Unknown'}`);
    console.error(`📡 [LiveTracking] ❌ [${requestId}] Error message: ${error.message || 'No message'}`);
    console.error(`📡 [LiveTracking] ❌ [${requestId}] Error stack:`, error.stack || 'No stack trace');

    // 5. Handle known error types
    const errorKey = error.message as string;
    const errorConfig = ERROR_MESSAGES[errorKey];

    console.log(`📡 [LiveTracking] 🔍 [${requestId}] Looking up error config for key: "${errorKey}"`);

    if (errorConfig) {
      console.log(`📡 [LiveTracking] ✅ [${requestId}] Known error found: ${errorConfig.message} (${errorConfig.status})`);
      console.log(`📡 [LiveTracking] ========================================`);
      res.status(errorConfig.status).json({
        success: false,
        message: errorConfig.message
      });
      return;
    }

    // 6. Handle generic errors
    console.error(`📡 [LiveTracking] ❌ [${requestId}] Unknown error type - sending generic response`);
    console.log(`📡 [LiveTracking] ========================================`);
    res.status(500).json({
      success: false,
      message: "Failed to get ride tracking details. Please try again later."
    });
  }
};