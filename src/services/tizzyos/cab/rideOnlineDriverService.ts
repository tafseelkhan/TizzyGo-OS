// services/tizzyos/cab/driverStatusService.ts

import mongoose from "mongoose";
import RideDriverStatus, {
  IRideDriverStatus,
} from "../../../models/tizzyos/cab/rideDriverStatus";
import RideDriverRegistration from "../../../models/tizzyos/cab/rideDriver";

// Interfaces
export interface IDriverStatusResponse {
  userId: mongoose.Types.ObjectId | string;
  isOnline: boolean;
  isAvailable: boolean;
  lastSeen: Date | null;
  socketId?: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IBulkUpdateResult {
  matched: number;
  modified: number;
  isOnline: boolean;
}

export interface IPaginationResult {
  drivers: any[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface IDefaultStatus {
  userId: string;
  isOnline: false;
  isAvailable: false;
  lastSeen: null;
  socketId: null;
  createdAt: null;
  updatedAt: null;
}

class DriverStatusService {
  /**
   * Check if driver registration is approved
   */
  async isDriverApproved(userId: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return false;
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    const driverRegistration = await RideDriverRegistration.findOne({
      userId: objectId,
      status: "approved",
    });

    return !!driverRegistration;
  }

  /**
   * Get driver registration status
   */
  async getDriverRegistrationStatus(userId: string): Promise<string | null> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return null;
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    const driverRegistration = await RideDriverRegistration.findOne({
      userId: objectId,
    });

    return driverRegistration?.status || null;
  }

  /**
   * Update driver online/offline status
   */
  async updateOnlineStatus(
    userId: string,
    isOnline: boolean,
  ): Promise<IRideDriverStatus> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID format");
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    // ✅ Check if driver is approved
    const isApproved = await this.isDriverApproved(userId);
    if (!isApproved) {
      throw new Error(
        "Driver registration is not approved. Please complete your registration.",
      );
    }

    const driverStatus = await RideDriverStatus.findOneAndUpdate(
      { userId: objectId },
      {
        $set: {
          userId: objectId,
          isOnline: isOnline,
          isAvailable: isOnline,
          lastSeen: new Date(),
        },
        $setOnInsert: {
          isAvailable: true,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: false,
      },
    );

    if (!driverStatus) {
      throw new Error("Failed to update driver status");
    }

    return driverStatus;
  }

  /**
   * Get driver current status
   */
  async getDriverStatus(
    userId: string,
  ): Promise<IDriverStatusResponse | IDefaultStatus> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID format");
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    const driverStatus = await RideDriverStatus.findOne({ userId: objectId });

    if (!driverStatus) {
      return {
        userId: userId,
        isOnline: false,
        isAvailable: false,
        lastSeen: null,
        socketId: null,
        createdAt: null,
        updatedAt: null,
      };
    }

    return {
      userId: driverStatus.userId,
      isOnline: driverStatus.isOnline,
      isAvailable: driverStatus.isAvailable,
      lastSeen: driverStatus.lastSeen,
      socketId: driverStatus.socketId || null,
      createdAt: driverStatus.createdAt,
      updatedAt: driverStatus.updatedAt,
    };
  }

  /**
   * Bulk update multiple drivers status
   */
  async bulkUpdateStatus(
    driverIds: string[],
    isOnline: boolean,
  ): Promise<IBulkUpdateResult> {
    if (!Array.isArray(driverIds) || driverIds.length === 0) {
      throw new Error("driverIds must be a non-empty array");
    }

    const validIds = driverIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id),
    );

    if (validIds.length === 0) {
      throw new Error("No valid driver IDs provided");
    }

    const objectIds = validIds.map((id) => new mongoose.Types.ObjectId(id));

    const result = await RideDriverStatus.updateMany(
      { userId: { $in: objectIds } },
      {
        $set: {
          isOnline: isOnline,
          isAvailable: isOnline,
          lastSeen: new Date(),
        },
      },
    );

    return {
      matched: result.matchedCount || 0,
      modified: result.modifiedCount || 0,
      isOnline: isOnline,
    };
  }

  /**
   * Get all online drivers with pagination
   */
  async getAllOnlineDrivers(
    limit: number = 100,
    offset: number = 0,
  ): Promise<IPaginationResult> {
    const drivers = await RideDriverStatus.find({
      isOnline: true,
    })
      .sort({ lastSeen: -1 })
      .skip(offset)
      .limit(limit)
      .select("userId isOnline isAvailable lastSeen socketId")
      .lean();

    const totalCount = await RideDriverStatus.countDocuments({
      isOnline: true,
    });

    return {
      drivers,
      pagination: {
        total: totalCount,
        limit: limit,
        offset: offset,
      },
    };
  }

  /**
   * Update driver availability
   */
  async updateAvailability(
    userId: string,
    isAvailable: boolean,
  ): Promise<IRideDriverStatus> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID format");
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    const driverStatus = await RideDriverStatus.findOneAndUpdate(
      { userId: objectId },
      {
        $set: {
          isAvailable: isAvailable,
          lastSeen: new Date(),
        },
        $setOnInsert: {
          isOnline: false,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: false,
      },
    );

    if (!driverStatus) {
      throw new Error("Failed to update availability");
    }

    return driverStatus;
  }

  /**
   * Update driver socket ID
   */
  async updateSocketId(
    userId: string,
    socketId: string,
  ): Promise<IRideDriverStatus> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID format");
    }

    if (!socketId) {
      throw new Error("socketId is required");
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    const driverStatus = await RideDriverStatus.findOneAndUpdate(
      { userId: objectId },
      {
        $set: {
          socketId: socketId,
          lastSeen: new Date(),
        },
        $setOnInsert: {
          isOnline: false,
          isAvailable: true,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: false,
      },
    );

    if (!driverStatus) {
      throw new Error("Failed to update socket ID");
    }

    return driverStatus;
  }

  /**
   * Get online drivers count
   */
  async getOnlineDriversCount(): Promise<number> {
    const count = await RideDriverStatus.countDocuments({
      isOnline: true,
    });
    return count;
  }

  /**
   * Cleanup stale statuses
   */
  async cleanupStaleStatuses(hours: number = 24): Promise<number> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    const result = await RideDriverStatus.deleteMany({
      isOnline: false,
      lastSeen: { $lt: cutoffTime },
    });

    return result.deletedCount || 0;
  }

  /**
   * Toggle driver status - ✅ WITH DRIVER REGISTRATION CHECK
   */
  async toggleDriverStatus(
    userId: string,
    socketId?: string,
  ): Promise<IRideDriverStatus> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID format");
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    // ✅ CHECK: Driver registration approved hai ya nahi
    const isApproved = await this.isDriverApproved(userId);
    if (!isApproved) {
      const status = await this.getDriverRegistrationStatus(userId);
      let errorMessage =
        "Driver registration is not approved. Please complete your registration.";

      if (status === "pending") {
        errorMessage =
          "Your driver registration is pending approval. Please wait for admin approval.";
      } else if (status === "rejected") {
        errorMessage =
          "Your driver registration has been rejected. Please contact support.";
      } else if (status === "incomplete") {
        errorMessage =
          "Your driver registration is incomplete. Please complete all required fields.";
      }

      throw new Error(errorMessage);
    }

    // ✅ Get current status
    const currentStatus = await RideDriverStatus.findOne({ userId: objectId });
    const newStatus = currentStatus ? !currentStatus.isOnline : true;

    const updateData: any = {
      userId: objectId,
      isOnline: newStatus,
      lastSeen: new Date(),
    };

    if (socketId) {
      updateData.socketId = socketId;
    }

    const driverStatus = await RideDriverStatus.findOneAndUpdate(
      { userId: objectId },
      {
        $set: updateData,
        $setOnInsert: {
          isAvailable: true,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: false,
      },
    );

    if (!driverStatus) {
      throw new Error("Failed to toggle driver status");
    }

    return driverStatus;
  }

  /**
   * Check if driver is online
   */
  async isDriverOnline(userId: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return false;
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    const driverStatus = await RideDriverStatus.findOne({
      userId: objectId,
      isOnline: true,
    });

    return !!driverStatus;
  }

  /**
   * Get driver by socket ID
   */
  async getDriverBySocketId(
    socketId: string,
  ): Promise<IRideDriverStatus | null> {
    const driverStatus = await RideDriverStatus.findOne({
      socketId: socketId,
    });
    return driverStatus;
  }

  /**
   * Clear socket ID when driver disconnects
   */
  async clearSocketId(userId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return;
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    await RideDriverStatus.findOneAndUpdate(
      { userId: objectId },
      {
        $set: {
          socketId: null,
          lastSeen: new Date(),
        },
      },
      {
        returnDocument: 'after',
        runValidators: false,
      },
    );
  }
}

export default new DriverStatusService();
