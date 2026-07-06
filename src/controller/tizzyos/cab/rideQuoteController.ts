// controllers/tizzyos/cab/rideQuoteController.ts

import { Request, Response } from "express";
import { RideQuoteService } from "../../../services/tizzyos/cab/rideQuoteService";

// =====================================================
// POST /api/ride/options
//
// Purpose:
// Returns all available vehicle options for the selected
// pickup and drop location.
//
// Called By:
// Customer Frontend
//
// Creates Booking?
// NO
//
// Uses Google Routes API?
// YES
//
// Uses Fare Calculation?
// YES
//
// Starts Driver Dispatch?
// NO
//
// Response:
// Distance, Duration, Polyline, ETA, Fare for all vehicle types
// =====================================================

export const getRideOptions = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { pickup, drop } = req.body;

    if (!pickup || !drop) {
      res.status(400).json({
        success: false,
        message: "Pickup and drop locations are required",
      });
      return;
    }

    const quoteService = new RideQuoteService();
    const options = await quoteService.getRideOptions({ pickup, drop });

    res.status(200).json({
      success: true,
      data: {
        options: options,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
      message: "Ride options fetched successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get ride options";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};
