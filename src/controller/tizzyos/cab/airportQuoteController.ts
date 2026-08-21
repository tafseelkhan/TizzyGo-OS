// controllers/tizzyos/cab/airportQuoteController.ts

import { Request, Response } from "express";
import { AirportQuoteService } from "../../../services/tizzyos/cab/airportQuoteService";

// =====================================================
// POST /api/ride/airport/quote
//
// Purpose:
// Returns all available vehicle options for Airport service
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
// Uses District Validation?
// NO (Airport can cross districts)
//
// Response:
// Distance, Duration, Polyline, ETA, Fare for all vehicle types
// =====================================================

export const getAirportRideOptions = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { pickup, drop, tripType } = req.body;

    if (!pickup || !drop) {
      res.status(400).json({
        success: false,
        message: "Pickup and drop locations are required",
      });
      return;
    }

    if (!tripType || !["AIRPORT_TO_LOCATION", "LOCATION_TO_AIRPORT"].includes(tripType)) {
      res.status(400).json({
        success: false,
        message: "Valid tripType is required: AIRPORT_TO_LOCATION or LOCATION_TO_AIRPORT",
      });
      return;
    }

    const airportQuoteService = new AirportQuoteService();
    const options = await airportQuoteService.getAirportRideOptions(
      { pickup, drop, tripType },
      userId,
    );

    res.status(200).json({
      success: true,
      data: {
        options: options,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        serviceType: "AIRPORT",
      },
      message: "Airport ride options fetched successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get airport ride options";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};