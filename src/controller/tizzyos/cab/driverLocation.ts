// controllers/rides/createOrUpdateRideDriverLocation.ts

import { Request, Response } from "express";
import RideDriverLocation from "../../../models/tizzyos/cab/rideDriverLocation";
import RideDriver from "../../../models/tizzyos/cab/rideDriver";

interface LocationRequestBody {
  isTrackingOn?: boolean;
  latitude?: number;
  longitude?: number;
  address?: string;
  googlePlaceId?: string;
  // driverCode removed from here - we'll fetch it from RideDriver
}

export const createOrUpdateRideDriverLocation = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ✅ First, find the driver by userId to get driverCode
    const driver = await RideDriver.findOne({ userId });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found. Please register as a driver first.",
      });
    }

    // ✅ Extract driverCode from the found driver
    const driverCode = driver.driverCode;

    const { isTrackingOn, latitude, longitude, address, googlePlaceId } =
      req.body as LocationRequestBody;

    // Validate required fields
    if (
      isTrackingOn === undefined ||
      latitude === undefined ||
      longitude === undefined ||
      address === undefined ||
      googlePlaceId === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required.",
      });
    }

    // Validate coordinates
    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude. Must be between -90 and 90.",
      });
    }

    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        message: "Invalid longitude. Must be between -180 and 180.",
      });
    }

    const existingLocation = await RideDriverLocation.findOne({ userId });

    if (existingLocation) {
      existingLocation.isTrackingOn = isTrackingOn;
      existingLocation.location = {
        latitude,
        longitude,
        address,
        googlePlaceId,
      };
      // ✅ Use driverCode from RideDriver
      existingLocation.driverCode = driverCode;

      await existingLocation.save();

      return res.status(200).json({
        success: true,
        message: "Driver location updated successfully.",
        data: {
          driverCode,
          isTrackingOn,
          location: {
            latitude,
            longitude,
            address,
            googlePlaceId,
          },
        },
      });
    }

    const newLocation = new RideDriverLocation({
      userId,
      isTrackingOn,
      location: {
        latitude,
        longitude,
        address,
        googlePlaceId,
      },
      // ✅ Use driverCode from RideDriver
      driverCode,
    });

    await newLocation.save();

    return res.status(201).json({
      success: true,
      message: "Driver location created successfully.",
      data: {
        driverCode,
        isTrackingOn,
        location: {
          latitude,
          longitude,
          address,
          googlePlaceId,
        },
      },
    });
  } catch (error) {
    console.error("Error in createOrUpdateRideDriverLocation:", error);

    // Proper error handling
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      ...(process.env.NODE_ENV === "development" && { error: errorMessage }),
    });
  }
};
