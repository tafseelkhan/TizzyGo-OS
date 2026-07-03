// controllers/rides/getRideVehicleCategories.ts
import { Request, Response } from "express";
import RideVehicleCategory from "../../../models/tizzyos/cab/rideVehicleCatigory";

export const getRideVehicleCategories = async (req: Request, res: Response) => {
  try {
    const categories = await RideVehicleCategory.find().sort({ category: 1 });

    if (!categories || categories.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ride vehicle categories not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ride vehicle categories fetched successfully.",
      data: categories,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};
