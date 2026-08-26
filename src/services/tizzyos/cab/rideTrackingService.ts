// services/tizzyos/cab/rideTrackingService.ts

import mongoose from "mongoose";
import RideTracking from "../../../models/tizzyos/cab/rideTracking";
import RideBooking from "../../../models/tizzyos/cab/rideBooking";

interface ILocationUpdate {
  latitude: number;
  longitude: number;
  address: string;
  googlePlaceId: string;
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

interface ITrackingData {
  bookingId: string;
  trackingId: string;
  rideId: mongoose.Types.ObjectId;
  rideCode: string;
  customerId: mongoose.Types.ObjectId;
  driverId: mongoose.Types.ObjectId;
  location: {
    type: "Point";
    coordinates: [number, number];
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId: string;
  };
  distanceFromPickup: number;
  distanceToDestination: number;
  tripDistanceCovered: number;
  tripDuration: number;
  rideStatus: string;
  pickupVerified: boolean;
  dropVerified: boolean;
  pickupVerifiedAt?: Date;
  dropVerifiedAt?: Date;
  lastLocationUpdate?: Date;
}

interface ITripMetrics {
  distance: number;
  duration: number;
  averageSpeed?: number;
  maxSpeed?: number;
  distanceRemaining?: number;
  estimatedTimeRemaining?: number;
}

export class RideTrackingService {
  private readonly MAX_TRACKING_HISTORY = 1000;
  private readonly UPDATE_THROTTLE_MS = 3000;
  private readonly DISTANCE_THRESHOLD_M = 10;
  private readonly trackingCache: Map<string, { data: any; timestamp: number }>;

  constructor() {
    this.trackingCache = new Map();
  }

  async createTracking(trackingData: ITrackingData): Promise<any> {
    if (!trackingData.bookingId || !trackingData.trackingId) {
      throw new Error("Booking ID and Tracking ID are required");
    }

    const tracking = new RideTracking(trackingData);
    await tracking.save();
    return tracking.toObject();
  }

  async updateTracking(
    trackingId: string,
    updateData: Partial<ITrackingData>,
  ): Promise<any> {
    if (!trackingId || typeof trackingId !== "string") {
      throw new Error("Invalid tracking ID");
    }

    if (!updateData || Object.keys(updateData).length === 0) {
      throw new Error("Update data is required");
    }

    const sanitizedData = this.sanitizeUpdateData(updateData);

    const tracking = await RideTracking.findOneAndUpdate(
      { trackingId },
      { $set: sanitizedData },
      {
        returnDocument: "after",
        runValidators: true,
      },
    );

    if (!tracking) {
      throw new Error(`Tracking not found: ${trackingId}`);
    }

    return tracking.toObject();
  }

  async updateDriverLocation(
    trackingId: string,
    location: ILocationUpdate,
  ): Promise<any> {
    if (!trackingId || typeof trackingId !== "string") {
      throw new Error("Invalid tracking ID");
    }

    this.validateLocation(location);

    const cacheKey = `${trackingId}:location`;
    const cached = this.trackingCache.get(cacheKey);

    if (cached) {
      const timeSinceUpdate = Date.now() - cached.timestamp;
      const distance = this.calculateDistance(
        cached.data.latitude,
        cached.data.longitude,
        location.latitude,
        location.longitude,
      );

      if (
        timeSinceUpdate < this.UPDATE_THROTTLE_MS &&
        distance < this.DISTANCE_THRESHOLD_M
      ) {
        return cached.data;
      }
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const tracking = await RideTracking.findOne({ trackingId }).session(
        session,
      );

      if (!tracking) {
        throw new Error(`Tracking not found: ${trackingId}`);
      }

      const now = new Date();

      const previousLocation = tracking.location;
      let distanceTraveled = 0;

      if (
        previousLocation &&
        previousLocation.latitude &&
        previousLocation.longitude
      ) {
        distanceTraveled = this.calculateDistance(
          previousLocation.latitude,
          previousLocation.longitude,
          location.latitude,
          location.longitude,
        );
      }

      tracking.location = {
        type: "Point",
        coordinates: [location.longitude, location.latitude],
        latitude: location.latitude,
        longitude: location.longitude,
        // address: location.address || tracking.location?.address || "",
        // googlePlaceId:
        //   location.googlePlaceId || tracking.location?.googlePlaceId || "",
      };

      tracking.heading = location.heading;
      tracking.speed = location.speed;
      tracking.accuracy = location.accuracy;
      tracking.bearing = location.bearing;
      tracking.altitude = location.altitude;
      tracking.provider = location.provider;
      tracking.batteryLevel = location.batteryLevel;
      tracking.networkType = location.networkType;
      tracking.isMockLocation = location.isMockLocation;
      tracking.lastLocationUpdate = now;

      if (distanceTraveled > 0) {
        tracking.tripDistanceCovered =
          (tracking.tripDistanceCovered || 0) + distanceTraveled;
      }

      if (tracking.pickupVerifiedAt) {
        const durationSeconds = Math.floor(
          (now.getTime() - tracking.pickupVerifiedAt.getTime()) / 1000,
        );
        tracking.tripDuration = durationSeconds;
      }

      await tracking.save({ session });

      await this.updateBookingLocation(tracking.bookingId, location, session);

      await session.commitTransaction();

      const result = tracking.toObject();

      this.trackingCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private async updateBookingLocation(
    bookingId: string,
    location: ILocationUpdate,
    session: mongoose.ClientSession,
  ): Promise<void> {
    await RideBooking.findOneAndUpdate(
      { bookingId },
      {
        $set: {
          currentLocation: {
            latitude: location.latitude,
            longitude: location.longitude,
            address: location.address,
            googlePlaceId: location.googlePlaceId,
          },
          lastLocationUpdate: new Date(),
        },
      },
      { session },
    );
  }

  async getTracking(trackingId: string): Promise<any> {
    if (!trackingId || typeof trackingId !== "string") {
      throw new Error("Invalid tracking ID");
    }

    const cacheKey = `tracking:${trackingId}`;
    const cached = this.trackingCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached.data;
    }

    const tracking = await RideTracking.findOne({ trackingId }).lean().exec();

    if (!tracking) {
      throw new Error(`Tracking not found: ${trackingId}`);
    }

    this.trackingCache.set(cacheKey, {
      data: tracking,
      timestamp: Date.now(),
    });

    return tracking;
  }

  async getTrackingByBooking(bookingId: string): Promise<any> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    const cacheKey = `tracking:booking:${bookingId}`;
    const cached = this.trackingCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached.data;
    }

    const tracking = await RideTracking.findOne({ bookingId }).lean().exec();

    if (!tracking) {
      throw new Error(`Tracking not found for booking: ${bookingId}`);
    }

    this.trackingCache.set(cacheKey, {
      data: tracking,
      timestamp: Date.now(),
    });

    return tracking;
  }

  async verifyPickup(trackingId: string): Promise<any> {
    if (!trackingId || typeof trackingId !== "string") {
      throw new Error("Invalid tracking ID");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const tracking = await RideTracking.findOne({ trackingId }).session(
        session,
      );

      if (!tracking) {
        throw new Error(`Tracking not found: ${trackingId}`);
      }

      if (tracking.pickupVerified) {
        throw new Error("Pickup already verified");
      }

      const now = new Date();
      tracking.pickupVerified = true;
      tracking.pickupVerifiedAt = now;
      tracking.rideStatus = "pickupVerified";
      await tracking.save({ session });

      const booking = await RideBooking.findOne({
        bookingId: tracking.bookingId,
      }).session(session);

      if (booking) {
        booking.pickupVerified = true;
        booking.pickupVerifiedAt = now;
        booking.status = "pickupVerified";
        await booking.save({ session });
      } else {
        throw new Error(`Booking not found: ${tracking.bookingId}`);
      }

      await session.commitTransaction();

      const result = tracking.toObject();

      this.trackingCache.set(`tracking:${trackingId}`, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async verifyDrop(trackingId: string): Promise<any> {
    if (!trackingId || typeof trackingId !== "string") {
      throw new Error("Invalid tracking ID");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const tracking = await RideTracking.findOne({ trackingId }).session(
        session,
      );

      if (!tracking) {
        throw new Error(`Tracking not found: ${trackingId}`);
      }

      if (tracking.dropVerified) {
        throw new Error("Drop already verified");
      }

      if (!tracking.pickupVerified) {
        throw new Error("Pickup must be verified before drop verification");
      }

      const now = new Date();
      tracking.dropVerified = true;
      tracking.dropVerifiedAt = now;
      tracking.rideStatus = "dropVerified";
      await tracking.save({ session });

      const booking = await RideBooking.findOne({
        bookingId: tracking.bookingId,
      }).session(session);

      if (booking) {
        booking.dropVerified = true;
        booking.dropVerifiedAt = now;
        booking.status = "dropVerified";
        booking.completedAt = now;
        await booking.save({ session });
      } else {
        throw new Error(`Booking not found: ${tracking.bookingId}`);
      }

      await session.commitTransaction();

      const result = tracking.toObject();

      this.trackingCache.set(`tracking:${trackingId}`, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async calculateTripMetrics(trackingId: string): Promise<ITripMetrics> {
    if (!trackingId || typeof trackingId !== "string") {
      throw new Error("Invalid tracking ID");
    }

    const tracking = await RideTracking.findOne({ trackingId }).lean().exec();

    if (!tracking) {
      throw new Error(`Tracking not found: ${trackingId}`);
    }

    const distance = tracking.tripDistanceCovered || 0;
    let duration = tracking.tripDuration || 0;

    if (tracking.pickupVerifiedAt && !tracking.dropVerifiedAt) {
      const now = new Date();
      duration = Math.floor(
        (now.getTime() - tracking.pickupVerifiedAt.getTime()) / 1000,
      );
    }

    const metrics: ITripMetrics = {
      distance: Math.round(distance * 100) / 100,
      duration: duration,
    };

    if (duration > 0) {
      metrics.averageSpeed =
        Math.round((distance / (duration / 3600)) * 100) / 100;
    }

    if (tracking.distanceToDestination) {
      metrics.distanceRemaining = Math.max(
        0,
        tracking.distanceToDestination - distance,
      );
    }

    if (metrics.distanceRemaining !== undefined && metrics.averageSpeed) {
      metrics.estimatedTimeRemaining = Math.round(
        (metrics.distanceRemaining / (metrics.averageSpeed || 1)) * 3600,
      );
    }

    return metrics;
  }

  async getTrackingHistory(
    trackingId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    } = {},
  ): Promise<any[]> {
    if (!trackingId || typeof trackingId !== "string") {
      throw new Error("Invalid tracking ID");
    }

    const limit = Math.min(options.limit || 50, this.MAX_TRACKING_HISTORY);

    const query: any = { trackingId };

    if (options.startDate || options.endDate) {
      query.lastLocationUpdate = {};
      if (options.startDate) {
        query.lastLocationUpdate.$gte = options.startDate;
      }
      if (options.endDate) {
        query.lastLocationUpdate.$lte = options.endDate;
      }
    }

    const history = await RideTracking.find(query)
      .sort({ lastLocationUpdate: -1 })
      .limit(limit)
      .lean()
      .exec();

    return history;
  }

  async updateRideStatus(trackingId: string, status: string): Promise<any> {
    if (!trackingId || typeof trackingId !== "string") {
      throw new Error("Invalid tracking ID");
    }

    if (!status || typeof status !== "string") {
      throw new Error("Invalid status");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const tracking = await RideTracking.findOne({ trackingId }).session(
        session,
      );

      if (!tracking) {
        throw new Error(`Tracking not found: ${trackingId}`);
      }

      const validStatuses = [
        "accepted",
        "arrived",
        "pickupVerified",
        "inTransit",
        "dropVerified",
        "completed",
        "cancelled",
      ];

      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid ride status: ${status}`);
      }

      tracking.rideStatus = status;
      await tracking.save({ session });

      await RideBooking.findOneAndUpdate(
        { bookingId: tracking.bookingId },
        { $set: { status } },
        { session },
      );

      await session.commitTransaction();

      const result = tracking.toObject();

      this.trackingCache.set(`tracking:${trackingId}`, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async getActiveTrackingByDriver(
    driverId: string | mongoose.Types.ObjectId,
  ): Promise<any> {
    const validatedDriverId = this.validateObjectId(driverId);

    const tracking = await RideTracking.findOne({
      driverId: validatedDriverId,
      rideStatus: {
        $in: ["accepted", "arrived", "pickupVerified", "inTransit"],
      },
    })
      .lean()
      .exec();

    return tracking;
  }

  async getActiveTrackingByCustomer(
    customerId: string | mongoose.Types.ObjectId,
  ): Promise<any> {
    const validatedCustomerId = this.validateObjectId(customerId);

    const tracking = await RideTracking.findOne({
      customerId: validatedCustomerId,
      rideStatus: {
        $in: ["accepted", "arrived", "pickupVerified", "inTransit"],
      },
    })
      .lean()
      .exec();

    return tracking;
  }

  async updateTrackingWithDriverStatus(
    trackingId: string,
    driverStatus: {
      isOnline?: boolean;
      isAvailable?: boolean;
      location?: ILocationUpdate;
    },
  ): Promise<any> {
    if (!trackingId || typeof trackingId !== "string") {
      throw new Error("Invalid tracking ID");
    }

    const updateData: any = {};

    if (driverStatus.location) {
      const location = driverStatus.location;
      updateData.location = {
        type: "Point",
        coordinates: [location.longitude, location.latitude],
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
        googlePlaceId: location.googlePlaceId,
      };
      updateData.heading = location.heading;
      updateData.speed = location.speed;
      updateData.accuracy = location.accuracy;
      updateData.bearing = location.bearing;
      updateData.altitude = location.altitude;
      updateData.provider = location.provider;
      updateData.batteryLevel = location.batteryLevel;
      updateData.networkType = location.networkType;
      updateData.isMockLocation = location.isMockLocation;
      updateData.lastLocationUpdate = new Date();
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error("No update data provided");
    }

    const tracking = await RideTracking.findOneAndUpdate(
      { trackingId },
      { $set: updateData },
      {
        returnDocument: "after",
        runValidators: true,
      },
    );

    if (!tracking) {
      throw new Error(`Tracking not found: ${trackingId}`);
    }

    return tracking.toObject();
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000;
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

  private validateLocation(location: ILocationUpdate): void {
    if (!location) {
      throw new Error("Location data is required");
    }

    if (typeof location.latitude !== "number" || isNaN(location.latitude)) {
      throw new Error("Invalid latitude");
    }

    if (typeof location.longitude !== "number" || isNaN(location.longitude)) {
      throw new Error("Invalid longitude");
    }

    if (location.latitude < -90 || location.latitude > 90) {
      throw new Error("Latitude must be between -90 and 90");
    }

    if (location.longitude < -180 || location.longitude > 180) {
      throw new Error("Longitude must be between -180 and 180");
    }

    if (location.address === undefined || location.address === null) {
      throw new Error("Address is required");
    }

    if (
      location.googlePlaceId === undefined ||
      location.googlePlaceId === null
    ) {
      throw new Error("Google Place ID is required");
    }
  }

  private sanitizeUpdateData(data: any): any {
    const sanitized: any = {};
    const allowedFields = [
      "location",
      "heading",
      "speed",
      "accuracy",
      "bearing",
      "altitude",
      "provider",
      "batteryLevel",
      "networkType",
      "isMockLocation",
      "distanceFromPickup",
      "distanceToDestination",
      "tripDistanceCovered",
      "tripDuration",
      "rideStatus",
      "pickupVerified",
      "dropVerified",
      "pickupVerifiedAt",
      "dropVerifiedAt",
      "lastLocationUpdate",
    ];

    for (const [key, value] of Object.entries(data)) {
      if (
        allowedFields.includes(key) &&
        value !== undefined &&
        value !== null
      ) {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private validateObjectId(
    id: string | mongoose.Types.ObjectId | null | undefined,
  ): mongoose.Types.ObjectId {
    if (!id) {
      throw new Error("ObjectId is required");
    }

    if (id instanceof mongoose.Types.ObjectId) {
      return id;
    }

    if (typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }

    throw new Error(`Invalid ObjectId: ${String(id)}`);
  }

  clearCache(): void {
    this.trackingCache.clear();
  }

  async cleanupCompletedTracking(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    const result = await RideTracking.deleteMany({
      rideStatus: { $in: ["completed", "dropVerified"] },
      dropVerifiedAt: { $lt: cutoffDate },
    });

    return result.deletedCount || 0;
  }
}
