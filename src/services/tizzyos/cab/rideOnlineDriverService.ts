import mongoose from "mongoose";
import RideDriverStatus, {
  IRideDriverStatus,
} from "../../../models/tizzyos/cab/rideDriverStatus";
import RideDriverRegistration from "../../../models/tizzyos/cab/rideDriver";

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
   * ✅ FIXED: Update ONLY isOnline, NOT isAvailable
   * isAvailable remains unchanged
   */
  async updateOnlineStatus(
    userId: string,
    isOnline: boolean,
  ): Promise<IRideDriverStatus> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID format");
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    const isApproved = await this.isDriverApproved(userId);
    if (!isApproved) {
      throw new Error(
        "Driver registration is not approved. Please complete your registration.",
      );
    }

    console.log(`🔄 [DriverStatus] Updating online status for ${userId} -> ${isOnline ? 'ONLINE' : 'OFFLINE'}`);

    // ✅ FIXED: ONLY update isOnline
    // isAvailable ko TOUCH nahi karna hai!
    const driverStatus = await RideDriverStatus.findOneAndUpdate(
      { userId: objectId },
      {
        $set: {
          userId: objectId,
          isOnline: isOnline,
          lastSeen: new Date(),
        },
        // ✅ isAvailable sirf insert time par default set karo
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

    console.log(`✅ [DriverStatus] Online status updated: ${userId} -> ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    console.log(`   isOnline: ${driverStatus.isOnline}, isAvailable: ${driverStatus.isAvailable}`);

    return driverStatus;
  }

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

    // ✅ FIXED: Bulk update ONLY isOnline, NOT isAvailable
    const result = await RideDriverStatus.updateMany(
      { userId: { $in: objectIds } },
      {
        $set: {
          isOnline: isOnline,
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
   * ✅ FIXED: Update ONLY isAvailable, NOT isOnline
   * isOnline remains unchanged
   */
  async updateAvailability(
    userId: string,
    isAvailable: boolean,
  ): Promise<IRideDriverStatus> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID format");
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    console.log(`🔄 [DriverStatus] Updating availability for ${userId} -> ${isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}`);

    const driverStatus = await RideDriverStatus.findOneAndUpdate(
      { userId: objectId },
      {
        $set: {
          isAvailable: isAvailable,
          lastSeen: new Date(),
        },
        // ✅ isOnline sirf insert time par default set karo
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

    console.log(`✅ [DriverStatus] Availability updated: ${userId} -> ${isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}`);
    console.log(`   isOnline: ${driverStatus.isOnline}, isAvailable: ${driverStatus.isAvailable}`);

    return driverStatus;
  }

  /**
   * ✅ FIXED: Update ONLY socketId
   * isOnline and isAvailable remain unchanged
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

    console.log(`🔌 [DriverStatus] Updating socket ID for ${userId} -> ${socketId}`);

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

    console.log(`✅ [DriverStatus] Socket ID updated: ${userId} -> ${socketId}`);
    console.log(`   isOnline: ${driverStatus.isOnline}, isAvailable: ${driverStatus.isAvailable}`);

    return driverStatus;
  }

  async getOnlineDriversCount(): Promise<number> {
    const count = await RideDriverStatus.countDocuments({
      isOnline: true,
    });
    return count;
  }

  async cleanupStaleStatuses(hours: number = 24): Promise<number> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    const result = await RideDriverStatus.deleteMany({
      isOnline: false,
      lastSeen: { $lt: cutoffTime },
    });

    return result.deletedCount || 0;
  }

  /**
   * ✅ FIXED: Toggle ONLY isOnline, NOT isAvailable
   */
  async toggleDriverStatus(
    userId: string,
    socketId?: string,
  ): Promise<IRideDriverStatus> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID format");
    }

    const objectId = new mongoose.Types.ObjectId(userId);

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

    const currentStatus = await RideDriverStatus.findOne({ userId: objectId });
    const newStatus = currentStatus ? !currentStatus.isOnline : true;

    console.log(`🔄 [DriverStatus] Toggling status for ${userId} -> ${newStatus ? 'ONLINE' : 'OFFLINE'}`);

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
        // ✅ isAvailable sirf insert time par default set karo
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

    console.log(`✅ [DriverStatus] Status toggled: ${userId} -> ${newStatus ? 'ONLINE' : 'OFFLINE'}`);
    console.log(`   isOnline: ${driverStatus.isOnline}, isAvailable: ${driverStatus.isAvailable}`);

    return driverStatus;
  }

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

  async getDriverBySocketId(
    socketId: string,
  ): Promise<IRideDriverStatus | null> {
    const driverStatus = await RideDriverStatus.findOne({
      socketId: socketId,
    });
    return driverStatus;
  }

  /**
   * ✅ FIXED: Clear ONLY socketId
   * isOnline and isAvailable remain unchanged
   * 
   * IMPORTANT: Only clears socketId if it matches the disconnecting socket
   * This prevents race condition where old socket clears new socket's ID
   */
  async clearSocketId(userId: string, socketId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return;
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    console.log(`🔌 [DriverStatus] Clearing socket ID for ${userId} (socket: ${socketId})`);

    // ✅ ONLY clear socketId if it matches the disconnecting socket
    // This prevents race condition
    const result = await RideDriverStatus.findOneAndUpdate(
      { 
        userId: objectId,
        socketId: socketId, // ← IMPORTANT: Match specific socket
      },
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

    if (result) {
      console.log(`✅ [DriverStatus] Socket ID cleared for ${userId}`);
      console.log(`   isOnline: ${result.isOnline}, isAvailable: ${result.isAvailable}`);
    } else {
      console.log(`⚠️ [DriverStatus] Socket ${socketId} not found for ${userId}`);
    }
  }

  /**
   * ✅ NEW: Clear socketId without userId check (for safety)
   * Use this only when you're sure about the userId
   */
  async clearSocketIdByUserId(userId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return;
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    console.log(`🔌 [DriverStatus] Force clearing socket ID for ${userId}`);

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