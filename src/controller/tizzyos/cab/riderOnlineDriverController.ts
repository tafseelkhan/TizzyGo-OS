// controller/tizzyos/cab/rideOnlineDriverController.ts

import { Request, Response } from "express";
import driverStatusService from "../../../services/tizzyos/cab/rideOnlineDriverService";

/**
 * Update Driver Online/Offline Status
 * PUT /api/driver/online-status
 */
export const updateDriverOnlineStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { isOnline } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized - User not authenticated",
      });
      return;
    }

    if (typeof isOnline !== "boolean") {
      res.status(400).json({
        success: false,
        message: "isOnline must be a boolean value (true/false)",
      });
      return;
    }

    const driverStatus = await driverStatusService.updateOnlineStatus(
      userId,
      isOnline,
    );

    res.status(200).json({
      success: true,
      message: `Driver is now ${isOnline ? "ONLINE" : "OFFLINE"}`,
      data: {
        userId: driverStatus.userId,
        isOnline: driverStatus.isOnline,
        isAvailable: driverStatus.isAvailable,
        lastSeen: driverStatus.lastSeen,
        updatedAt: driverStatus.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating driver online status:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

/**
 * Get Driver Current Status
 * GET /api/driver/status
 */
export const getDriverStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized - User not authenticated",
      });
      return;
    }

    const driverStatus = await driverStatusService.getDriverStatus(userId);

    res.status(200).json({
      success: true,
      data: {
        userId: driverStatus.userId,
        isOnline: driverStatus.isOnline,
        isAvailable: driverStatus.isAvailable,
        lastSeen: driverStatus.lastSeen,
        socketId: driverStatus.socketId || null,
        createdAt: driverStatus.createdAt || null,
        updatedAt: driverStatus.updatedAt || null,
      },
    });
  } catch (error) {
    console.error("Error getting driver status:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

/**
 * Bulk Update - Multiple Drivers Online Status
 * PUT /api/drivers/bulk-status
 */
export const bulkUpdateDriverStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { driverIds, isOnline } = req.body;

    if (!Array.isArray(driverIds) || driverIds.length === 0) {
      res.status(400).json({
        success: false,
        message: "driverIds must be a non-empty array",
      });
      return;
    }

    if (typeof isOnline !== "boolean") {
      res.status(400).json({
        success: false,
        message: "isOnline must be a boolean value",
      });
      return;
    }

    const result = await driverStatusService.bulkUpdateStatus(
      driverIds,
      isOnline,
    );

    res.status(200).json({
      success: true,
      message: `Updated ${result.modified} drivers to ${isOnline ? "ONLINE" : "OFFLINE"}`,
      data: result,
    });
  } catch (error) {
    console.error("Error bulk updating driver status:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

/**
 * Get All Online Drivers
 * GET /api/drivers/online
 */
export const getAllOnlineDrivers = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await driverStatusService.getAllOnlineDrivers(limit, offset);

    res.status(200).json({
      success: true,
      data: result.drivers,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Error getting online drivers:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

/**
 * Toggle Driver Status (Online/Offline) - ✅ SOCKET ADDED
 * PUT /api/driver/toggle-status
 */
export const toggleDriverStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { socketId } = req.body; // ✅ Socket ID receive karo

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized - User not authenticated",
      });
      return;
    }

    // ✅ Socket ID ke saath toggle karo
    const driverStatus = await driverStatusService.toggleDriverStatus(
      userId,
      socketId,
    );

    res.status(200).json({
      success: true,
      message: `Driver status toggled to ${driverStatus.isOnline ? "ONLINE" : "OFFLINE"}`,
      data: {
        userId: driverStatus.userId,
        isOnline: driverStatus.isOnline,
        isAvailable: driverStatus.isAvailable,
        lastSeen: driverStatus.lastSeen,
        socketId: driverStatus.socketId || null,
      },
    });
  } catch (error) {
    console.error("Error toggling driver status:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

/**
 * Get Online Drivers Count
 * GET /api/drivers/online/count
 */
export const getOnlineDriversCount = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const count = await driverStatusService.getOnlineDriversCount();

    res.status(200).json({
      success: true,
      data: {
        onlineCount: count,
      },
    });
  } catch (error) {
    console.error("Error getting online drivers count:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

/**
 * Update Driver Socket ID
 * PUT /api/driver/socket
 */
export const updateDriverSocketId = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { socketId } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized - User not authenticated",
      });
      return;
    }

    if (!socketId || typeof socketId !== "string") {
      res.status(400).json({
        success: false,
        message: "socketId is required and must be a string",
      });
      return;
    }

    const driverStatus = await driverStatusService.updateSocketId(
      userId,
      socketId,
    );

    res.status(200).json({
      success: true,
      message: "Socket ID updated successfully",
      data: {
        userId: driverStatus.userId,
        socketId: driverStatus.socketId,
        isOnline: driverStatus.isOnline,
      },
    });
  } catch (error) {
    console.error("Error updating socket ID:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

/**
 * Cleanup Stale Statuses
 * DELETE /api/drivers/cleanup
 */
export const cleanupStaleStatuses = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;

    const deletedCount = await driverStatusService.cleanupStaleStatuses(hours);

    res.status(200).json({
      success: true,
      message: `Cleaned up ${deletedCount} stale driver statuses`,
      data: {
        deletedCount,
        hoursThreshold: hours,
      },
    });
  } catch (error) {
    console.error("Error cleaning up stale statuses:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};
