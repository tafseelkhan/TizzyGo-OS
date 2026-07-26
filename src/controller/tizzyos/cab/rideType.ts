// controllers/rides/getRideTypes.ts
import { Request, Response } from "express";
import RideType from "../../../models/tizzyos/cab/rideType";

export const getRideTypes = async (req: Request, res: Response) => {
  try {
    const { vehicleClass, isActive = true } = req.query;

    let filter: any = {};

    // Filter by vehicle class
    if (vehicleClass) {
      filter.vehicleClasses = { $in: [vehicleClass] };
    }

    const rideTypes = await RideType.find(filter).sort({
      name: 1,
    });

    if (!rideTypes || rideTypes.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ride types not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ride types fetched successfully.",
      data: rideTypes,
      count: rideTypes.length,
    });
  } catch (error) {
    console.error("Error fetching ride types:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};
