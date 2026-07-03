// controllers/rides/updateRideDriverOnlineStatus.ts

import { Request, Response } from "express";
import RideDriverStatus from "../../../models/tizzyos/cab/rideDriverStatus";

interface StatusRequestBody {
  isOnline?: boolean;
  isAvailable?: boolean;
  socketId?: string;
}

export const updateRideDriverOnlineStatus = async (
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

    const { isOnline, isAvailable, socketId } = req.body as StatusRequestBody;

    if (isOnline === undefined || isAvailable === undefined) {
      return res.status(400).json({
        success: false,
        message: "isOnline and isAvailable are required.",
      });
    }

    const existingStatus = await RideDriverStatus.findOne({ userId });

    if (existingStatus) {
      existingStatus.isOnline = isOnline;
      existingStatus.isAvailable = isAvailable;
      if (socketId) {
        existingStatus.socketId = socketId;
      }
      existingStatus.lastSeen = new Date();

      await existingStatus.save();

      return res.status(200).json({
        success: true,
        message: "Driver status updated successfully.",
      });
    }

    if (!socketId) {
      return res.status(400).json({
        success: false,
        message: "socketId is required for creating new status.",
      });
    }

    const newStatus = new RideDriverStatus({
      userId,
      isOnline,
      isAvailable,
      socketId,
      lastSeen: new Date(),
    });

    await newStatus.save();

    return res.status(200).json({
      success: true,
      message: "Driver status updated successfully.",
    });
  } catch (error) {
    console.error("Error in updateRideDriverOnlineStatus:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

export const getRideDriverOnlineStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const status = await RideDriverStatus.findOne({ userId });

    if (!status) {
      return res.status(404).json({
        success: false,
        message: "Driver status not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Driver status fetched successfully.",
      data: status,
    });
  } catch (error) {
    console.error("Error in getRideDriverOnlineStatus:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};