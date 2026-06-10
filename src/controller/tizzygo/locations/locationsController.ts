// src/controller/tizzygo/locations/locationsController.ts

import { Request, Response } from "express";
import BuyerLocation from "../../../models/tizzygo/locations/locations";

export const saveBuyerLocation = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    const { label, location, isDefault } = req.body;

    // Validate location data
    if (
      !location ||
      !location.coordinates ||
      location.coordinates.length !== 2
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid coordinates",
      });
      return;
    }

    // ✅ Frontend se full address aayega, no defaults needed
    // Frontend will send: address, city, state, country, pinCode

    const existingLocation = await BuyerLocation.findOne({ userId });

    if (existingLocation) {
      // Update existing location
      existingLocation.label = label || existingLocation.label;
      existingLocation.location = location;
      existingLocation.isDefault = isDefault ?? existingLocation.isDefault;

      await existingLocation.save();

      res.status(200).json({
        success: true,
        message: "Location updated successfully",
        data: existingLocation,
      });
      return;
    }

    // ✅ Create new location with frontend data (no defaults)
    const buyerLocation = await BuyerLocation.create({
      userId,
      label: label || "My Location",
      location, // Frontend se aaya hua complete location object
      isDefault: isDefault !== undefined ? isDefault : true,
      gpsTrackingEnabled: false, // Default false, user can enable later
    });

    res.status(201).json({
      success: true,
      message: "Location created successfully",
      data: buyerLocation,
    });
  } catch (error: any) {
    console.error("Save Buyer Location Error:", error);

    // ✅ Send proper validation error message
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const updateGpsTrackingStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    const { gpsTrackingEnabled } = req.body;

    if (typeof gpsTrackingEnabled !== "boolean") {
      res.status(400).json({
        success: false,
        message: "gpsTrackingEnabled must be boolean",
      });
      return;
    }

    const location = await BuyerLocation.findOne({ userId });

    // ✅ If location doesn't exist, return error (no auto-create)
    if (!location) {
      res.status(404).json({
        success: false,
        message:
          "Please save your delivery location first before enabling GPS tracking",
      });
      return;
    }

    // Update GPS tracking status
    location.gpsTrackingEnabled = gpsTrackingEnabled;
    await location.save();

    res.status(200).json({
      success: true,
      message: `GPS Tracking ${
        gpsTrackingEnabled ? "Enabled" : "Disabled"
      } Successfully`,
      data: {
        gpsTrackingEnabled: location.gpsTrackingEnabled,
      },
    });
  } catch (error) {
    console.error("Update GPS Tracking Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getBuyerLocation = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    const location = await BuyerLocation.findOne({ userId });

    if (!location) {
      res.status(404).json({
        success: false,
        message: "Location not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: location,
    });
  } catch (error) {
    console.error("Get Buyer Location Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
