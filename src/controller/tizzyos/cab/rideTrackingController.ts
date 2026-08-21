// controllers/tizzyos/cab/rideTrackingController.ts

import { Request, Response } from "express";
import { RideTrackingService } from "../../../services/tizzyos/cab/rideTrackingService";

export const getTracking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  console.log(`📍 [getTracking] ========================================`);
  console.log(`📍 [getTracking] Controller called`);

  try {
    const { trackingId } = req.params;
    const userId = req.user?.id;

    console.log(`📍 [getTracking] 📦 trackingId:`, trackingId);
    console.log(`📍 [getTracking] 👤 userId:`, userId);

    if (!userId) {
      console.log(`📍 [getTracking] ❌ Unauthorized: No userId`);
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    console.log(`📍 [getTracking] ✅ User authenticated: ${userId}`);

    const trackingService = new RideTrackingService();
    console.log(
      `📍 [getTracking] 📡 Calling trackingService.getTracking(${trackingId})...`,
    );

    const tracking = await trackingService.getTracking(trackingId);

    console.log(`📍 [getTracking] ✅ Tracking data retrieved`);
    console.log(
      `📍 [getTracking] 📦 Tracking data:`,
      JSON.stringify(tracking, null, 2),
    );

    res.status(200).json({
      success: true,
      data: tracking,
    });

    console.log(`📍 [getTracking] ✅ Response sent successfully`);
    console.log(`📍 [getTracking] ========================================`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get tracking";

    console.error(`📍 [getTracking] ❌ Error:`, errorMessage);
    console.error(`📍 [getTracking] ❌ Full error:`, error);
    console.log(`📍 [getTracking] ========================================`);

    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const getTrackingByBooking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const trackingService = new RideTrackingService();
    const tracking = await trackingService.getTrackingByBooking(bookingId);

    res.status(200).json({
      success: true,
      data: tracking,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to get tracking by booking";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const calculateMetrics = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { trackingId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const trackingService = new RideTrackingService();
    const metrics = await trackingService.calculateTripMetrics(trackingId);

    res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to calculate metrics";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const updateRideStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { trackingId } = req.params;
    const { status } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!status || typeof status !== "string") {
      res.status(400).json({
        success: false,
        message: "Valid status is required",
      });
      return;
    }

    const trackingService = new RideTrackingService();
    const tracking = await trackingService.updateRideStatus(trackingId, status);

    res.status(200).json({
      success: true,
      data: tracking,
      message: "Ride status updated successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update ride status";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const getActiveTracking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { type } = req.query;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const trackingService = new RideTrackingService();
    let tracking = null;

    if (type === "driver") {
      tracking = await trackingService.getActiveTrackingByDriver(userId);
    } else if (type === "customer") {
      tracking = await trackingService.getActiveTrackingByCustomer(userId);
    } else {
      res.status(400).json({
        success: false,
        message: "Valid type is required: 'driver' or 'customer'",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: tracking || null,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get active tracking";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};
