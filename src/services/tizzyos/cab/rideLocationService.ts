// services/tizzyos/cab/rideLocationService.ts

import mongoose from "mongoose";
import RideDriverLocation from "../../../models/tizzyos/cab/rideDriverLocation";
import RideDriverStatus from "../../../models/tizzyos/cab/rideDriverStatus";
import RideTracking from "../../../models/tizzyos/cab/rideTracking";
import RideBooking from "../../../models/tizzyos/cab/rideBooking";
import { RideSocketService } from "../../../socket/tizzyos/cab/rideSocket";

interface IDriverLocationData {
  userId: string | mongoose.Types.ObjectId;
  isTrackingOn: boolean;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  bearing?: number;
  altitude?: number;
  provider?: string;
  batteryLevel?: number;
  networkType?: string;
  isMockLocation: boolean;
}

interface ILocationPoint {
  type: "Point";
  coordinates: [number, number];
  latitude: number;
  longitude: number;
}

interface INearbyDriver {
  userId: mongoose.Types.ObjectId;
  driverCode: string;
  distance: number;
  location: {
    latitude: number;
    longitude: number;
  };
  heading?: number;
  speed?: number;
}

interface ITrackingUpdate {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  batteryLevel?: number;
}

export class RideLocationService {
  private readonly socketService: RideSocketService;
  private readonly MAX_BATCH_SIZE: number = 100;
  private readonly UPDATE_THROTTLE_MS: number = 2000;
  private readonly DISTANCE_THRESHOLD_M: number = 10;
  private readonly locationCache: Map<
    string,
    { data: IDriverLocationData; timestamp: number }
  >;

  constructor() {
    this.socketService = RideSocketService.getInstance();
    this.locationCache = new Map();
  }

  // ✅ FIXED: Add retry logic for write conflicts
  async updateDriverLocation(data: IDriverLocationData): Promise<void> {
    const validatedUserId = this.validateObjectId(data.userId);

    if (!this.isValidCoordinates(data.latitude, data.longitude)) {
      throw new Error(
        `Invalid coordinates: lat=${data.latitude}, lng=${data.longitude}`,
      );
    }

    if (this.shouldThrottleUpdate(validatedUserId.toString(), data)) {
      return;
    }

    // ✅ ADD RETRY LOGIC FOR WRITE CONFLICTS
    let retries = 3;
    let lastError: Error | null = null;

    while (retries > 0) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const locationPoint: ILocationPoint = {
          type: "Point",
          coordinates: [data.longitude, data.latitude],
          latitude: data.latitude,
          longitude: data.longitude,
        };

        const location = await RideDriverLocation.findOneAndUpdate(
          { userId: validatedUserId },
          {
            $set: {
              userId: validatedUserId,
              isTrackingOn: data.isTrackingOn,
              location: locationPoint,
              heading: data.heading,
              speed: data.speed,
              accuracy: data.accuracy,
              bearing: data.bearing,
              altitude: data.altitude,
              provider: data.provider,
              batteryLevel: data.batteryLevel,
              networkType: data.networkType,
              isMockLocation: data.isMockLocation,
              locationUpdatedAt: new Date(),
              lastSocketUpdate: new Date(),
            },
            $setOnInsert: {
              driverCode: validatedUserId.toString(),
            },
          },
          {
            upsert: true,
            returnDocument: "after",
            session,
            runValidators: true,
          },
        );

        if (!location) {
          throw new Error("Failed to update driver location");
        }

        // ✅ 2. Check karo ki user online hai ya nahi (SIRF CHECK - UPDATE NAHI)
        const driverStatus = await RideDriverStatus.findOne({
          userId: validatedUserId,
          isOnline: true,
        }).session(session);

        // ✅ 3. Agar online hai toh broadcast karo, nahi toh skip
        if (driverStatus) {
          await this.broadcastDriverLocationToCustomers(validatedUserId, data);
        }

        await session.commitTransaction();

        this.locationCache.set(validatedUserId.toString(), {
          data: { ...data },
          timestamp: Date.now(),
        });

        await this.broadcastDriverLocationToCustomers(validatedUserId, data);

        // ✅ SUCCESS - Exit function
        return;
      } catch (error: any) {
        await session.abortTransaction();

        // ✅ RETRY ON WRITE CONFLICT
        if (
          error.code === 112 ||
          error.codeName === "WriteConflict" ||
          error.code === 112
        ) {
          retries--;
          lastError = error;
          if (retries > 0) {
            const delay = 50 * (4 - retries);
            console.log(
              `⚠️ [Location] Write conflict, retrying in ${delay}ms (${retries} left)`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        throw error;
      } finally {
        await session.endSession();
      }
    }

    throw lastError || new Error("Update failed after retries");
  }

  private shouldThrottleUpdate(
    userId: string,
    data: IDriverLocationData,
  ): boolean {
    const cached = this.locationCache.get(userId);
    if (!cached) return false;

    const timeSinceLastUpdate = Date.now() - cached.timestamp;
    if (timeSinceLastUpdate < this.UPDATE_THROTTLE_MS) {
      const distance = this.calculateDistance(
        cached.data.latitude,
        cached.data.longitude,
        data.latitude,
        data.longitude,
      );

      if (distance < this.DISTANCE_THRESHOLD_M) {
        return true;
      }
    }

    return false;
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private async broadcastDriverLocationToCustomers(
    userId: mongoose.Types.ObjectId,
    data: IDriverLocationData,
  ): Promise<void> {
    try {
      const activeRide = await RideBooking.findOne({
        driverId: userId,
        status: {
          $in: ["accepted", "arrived", "pickupVerified", "inTransit"],
        },
      })
        .select("bookingId customerId status trackingId rideCode _id")
        .lean()
        .exec();

      if (!activeRide) return;

      const trackingUpdate: ITrackingUpdate = {
        latitude: data.latitude,
        longitude: data.longitude,
        heading: data.heading,
        speed: data.speed,
        accuracy: data.accuracy,
        batteryLevel: data.batteryLevel,
      };

      const tracking = await RideTracking.findOneAndUpdate(
        { bookingId: activeRide.bookingId },
        {
          $set: {
            location: {
              type: "Point",
              coordinates: [data.longitude, data.latitude],
              latitude: data.latitude,
              longitude: data.longitude,
            },
            heading: data.heading,
            speed: data.speed,
            accuracy: data.accuracy,
            batteryLevel: data.batteryLevel,
            lastLocationUpdate: new Date(),
          },
        },
        {
          returnDocument: "after",
          runValidators: true,
        },
      );

      if (!tracking) {
        const booking = await RideBooking.findOne({
          bookingId: activeRide.bookingId,
        }).lean();

        if (booking && booking.trackingId) {
          const newTracking = new RideTracking({
            bookingId: activeRide.bookingId,
            trackingId: booking.trackingId,
            rideId: booking._id,
            rideCode: booking.rideCode,
            customerId: booking.customerId,
            driverId: userId,
            location: {
              type: "Point",
              coordinates: [data.longitude, data.latitude],
              latitude: data.latitude,
              longitude: data.longitude,
            },
            rideStatus: "inTransit",
            lastLocationUpdate: new Date(),
          });
          await newTracking.save();
        }
      }

      this.socketService.emitLiveLocation(
        activeRide.customerId.toString(),
        activeRide.bookingId,
        {
          latitude: data.latitude,
          longitude: data.longitude,
          heading: data.heading,
          speed: data.speed,
          accuracy: data.accuracy,
          bearing: data.bearing,
          altitude: data.altitude,
          timestamp: new Date().toISOString(),
        },
      );
    } catch (error) {
      console.error("Failed to broadcast driver location:", error);
    }
  }

  async getNearbyDrivers(
    latitude: number,
    longitude: number,
    radius: number,
    limit: number = 20,
  ): Promise<INearbyDriver[]> {
    if (!this.isValidCoordinates(latitude, longitude)) {
      throw new Error(`Invalid coordinates: lat=${latitude}, lng=${longitude}`);
    }

    if (radius <= 0 || radius > 100) {
      throw new Error(
        `Invalid radius: ${radius}. Must be between 1 and 100 KM`,
      );
    }

    const maxLimit = Math.min(limit, this.MAX_BATCH_SIZE);
    const radiusInMeters = radius * 1000;

    try {
      const drivers = await RideDriverLocation.aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [longitude, latitude],
            },
            distanceField: "distance",
            maxDistance: radiusInMeters,
            spherical: true,
            distanceMultiplier: 0.001,
          },
        },
        {
          $match: {
            isTrackingOn: true,
            "location.latitude": { $exists: true },
            "location.longitude": { $exists: true },
          },
        },
        {
          $lookup: {
            from: "ridedriverstatuses",
            let: { userId: "$userId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$userId", "$$userId"] },
                      { $eq: ["$isOnline", true] },
                      { $eq: ["$isAvailable", true] },
                    ],
                  },
                },
              },
              { $limit: 1 },
            ],
            as: "status",
          },
        },
        {
          $match: {
            "status.0": { $exists: true },
          },
        },
        {
          $sort: { distance: 1 },
        },
        {
          $limit: maxLimit,
        },
        {
          $project: {
            userId: 1,
            driverCode: 1,
            distance: 1,
            "location.latitude": 1,
            "location.longitude": 1,
            "location.address": 1,
            heading: 1,
            speed: 1,
            accuracy: 1,
            lastSeen: "$locationUpdatedAt",
          },
        },
      ]);

      return drivers as INearbyDriver[];
    } catch (error) {
      console.error("Error finding nearby drivers:", error);
      throw new Error(
        `Failed to find nearby drivers: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getDriverLocation(
    userId: string | mongoose.Types.ObjectId,
  ): Promise<any> {
    const validatedUserId = this.validateObjectId(userId);

    const location = await RideDriverLocation.findOne({
      userId: validatedUserId,
    })
      .lean()
      .exec();

    if (!location) {
      throw new Error(`Driver location not found for user: ${validatedUserId}`);
    }

    return location;
  }

  async getDriverLocationHistory(
    userId: string | mongoose.Types.ObjectId,
    options: { startDate?: Date; endDate?: Date; limit?: number } = {},
  ): Promise<any[]> {
    const validatedUserId = this.validateObjectId(userId);
    const limit = Math.min(options.limit || 50, this.MAX_BATCH_SIZE);

    const query: any = { userId: validatedUserId };

    if (options.startDate || options.endDate) {
      query.locationUpdatedAt = {};
      if (options.startDate) {
        query.locationUpdatedAt.$gte = options.startDate;
      }
      if (options.endDate) {
        query.locationUpdatedAt.$lte = options.endDate;
      }
    }

    return RideDriverLocation.find(query)
      .sort({ locationUpdatedAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async getActiveDriverLocations(): Promise<any[]> {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const activeDrivers = await RideDriverLocation.aggregate([
      {
        $match: {
          isTrackingOn: true,
          locationUpdatedAt: { $gte: thirtyMinutesAgo },
        },
      },
      {
        $lookup: {
          from: "ridedriverstatuses",
          let: { userId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$userId", "$$userId"] },
                    { $eq: ["$isOnline", true] },
                    { $eq: ["$isAvailable", true] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "status",
        },
      },
      {
        $match: {
          "status.0": { $exists: true },
        },
      },
      {
        $project: {
          userId: 1,
          driverCode: 1,
          "location.latitude": 1,
          "location.longitude": 1,
          "location.address": 1,
          heading: 1,
          speed: 1,
          locationUpdatedAt: 1,
        },
      },
    ]);

    return activeDrivers;
  }

  async updateDriverTrackingStatus(
    userId: string | mongoose.Types.ObjectId,
    isTrackingOn: boolean,
  ): Promise<void> {
    const validatedUserId = this.validateObjectId(userId);

    const result = await RideDriverLocation.findOneAndUpdate(
      { userId: validatedUserId },
      {
        $set: {
          isTrackingOn,
          locationUpdatedAt: new Date(),
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
      },
    );

    if (!result) {
      throw new Error(`Driver location not found for user: ${validatedUserId}`);
    }
  }

  async cleanupStaleLocations(maxAgeMinutes: number = 60): Promise<number> {
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    const result = await RideDriverLocation.deleteMany({
      locationUpdatedAt: { $lt: cutoffTime },
      isTrackingOn: false,
    });

    return result.deletedCount || 0;
  }

  private isValidCoordinates(latitude: number, longitude: number): boolean {
    return (
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      !isNaN(latitude) &&
      !isNaN(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  private validateObjectId(
    id: string | mongoose.Types.ObjectId | any,
  ): mongoose.Types.ObjectId {
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    throw new Error(`Invalid ObjectId: ${String(id)}`);
  }

  async getDriverCountByRadius(
    latitude: number,
    longitude: number,
    radius: number,
  ): Promise<number> {
    if (!this.isValidCoordinates(latitude, longitude)) {
      throw new Error(`Invalid coordinates: lat=${latitude}, lng=${longitude}`);
    }

    const radiusInMeters = radius * 1000;

    const count = await RideDriverLocation.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          distanceField: "distance",
          maxDistance: radiusInMeters,
          spherical: true,
        },
      },
      {
        $match: {
          isTrackingOn: true,
        },
      },
      {
        $lookup: {
          from: "ridedriverstatuses",
          let: { userId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$userId", "$$userId"] },
                    { $eq: ["$isOnline", true] },
                    { $eq: ["$isAvailable", true] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "status",
        },
      },
      {
        $match: {
          "status.0": { $exists: true },
        },
      },
      {
        $count: "total",
      },
    ]);

    return count.length > 0 ? count[0].total : 0;
  }

  clearLocationCache(): void {
    this.locationCache.clear();
  }
}
