import { Request, Response } from "express";
import { RideLocationService } from "../../../services/tizzyos/cab/rideLocationService";

export const updateDriverLocation = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const locationService = new RideLocationService();
    const locationData = {
      ...req.body,
      userId,
      isTrackingOn: req.body.isTrackingOn ?? true,
    };

    await locationService.updateDriverLocation(locationData);

    res.status(200).json({
      success: true,
      message: "Location updated successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update location";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const getDriverLocation = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { driverId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const locationService = new RideLocationService();
    const location = await locationService.getDriverLocation(driverId);

    res.status(200).json({
      success: true,
      data: location,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get driver location";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const getNearbyDrivers = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { latitude, longitude, radius, limit } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!latitude || !longitude) {
      res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
      return;
    }

    const locationService = new RideLocationService();
    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);
    const rad = parseFloat(radius as string) || 5;
    const lim = parseInt(limit as string) || 20;

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude",
      });
      return;
    }

    const drivers = await locationService.getNearbyDrivers(lat, lng, rad, lim);

    res.status(200).json({
      success: true,
      data: drivers,
      count: drivers.length,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get nearby drivers";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const getActiveDrivers = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const locationService = new RideLocationService();
    const drivers = await locationService.getActiveDriverLocations();

    res.status(200).json({
      success: true,
      data: drivers,
      count: drivers.length,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get active drivers";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const updateTrackingStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { isTrackingOn } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (typeof isTrackingOn !== "boolean") {
      res.status(400).json({
        success: false,
        message: "isTrackingOn must be a boolean",
      });
      return;
    }

    const locationService = new RideLocationService();
    await locationService.updateDriverTrackingStatus(userId, isTrackingOn);

    res.status(200).json({
      success: true,
      message: `Tracking ${isTrackingOn ? "enabled" : "disabled"} successfully`,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to update tracking status";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};
