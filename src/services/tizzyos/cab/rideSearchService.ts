import mongoose from "mongoose";
import RideDriverLocation from "../../../models/tizzyos/cab/rideDriverLocation";

interface ISearchParams {
  latitude: number;
  longitude: number;
  radius: number;
  limit: number;
  isTrackingOn?: boolean;
  minDistance?: number;
}

interface IDriverLocation {
  userId: mongoose.Types.ObjectId;
  driverCode: string;
  distance: number;
  location: {
    latitude: number;
    longitude: number;
  };
  heading?: number;
  speed?: number;
  accuracy?: number;
  bearing?: number;
  altitude?: number;
  provider?: string;
  batteryLevel?: number;
  networkType?: string;
  isMockLocation?: boolean;
  locationUpdatedAt?: Date;
  lastSocketUpdate?: Date;
}

interface ILocationData {
  latitude: number;
  longitude: number;
  address?: string;
  googlePlaceId?: string;
  heading?: number;
  speed?: number;
  accuracy?: number;
  bearing?: number;
  altitude?: number;
  provider?: string;
  batteryLevel?: number;
  networkType?: string;
  isMockLocation?: boolean;
}

interface IAggregatedDriver {
  userId: mongoose.Types.ObjectId;
  driverCode: string;
  distance: number;
  location: {
    latitude: number;
    longitude: number;
  };
  heading?: number;
  speed?: number;
  accuracy?: number;
  bearing?: number;
  altitude?: number;
  provider?: string;
  batteryLevel?: number;
  networkType?: string;
  isMockLocation?: boolean;
  locationUpdatedAt?: Date;
  lastSocketUpdate?: Date;
  driverStatus?: {
    isOnline: boolean;
    isAvailable: boolean;
    lastSeen: Date;
  };
  driverInfo?: {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    status: string;
  };
}

export class RideSearchService {
  private readonly MAX_RADIUS_KM = 100;
  private readonly MIN_RADIUS_KM = 1;
  private readonly MAX_LIMIT = 50;
  private readonly DEFAULT_LIMIT = 20;
  private readonly CACHE_TTL_MS = 30000;
  private readonly locationCache: Map<
    string,
    { data: IDriverLocation[]; timestamp: number }
  >;

  constructor() {
    this.locationCache = new Map();
  }

  async findNearbyDrivers(params: ISearchParams): Promise<IDriverLocation[]> {
    const {
      latitude,
      longitude,
      radius,
      limit,
      isTrackingOn = true,
      minDistance = 0,
    } = params;

    this.validateCoordinates(latitude, longitude);
    this.validateRadius(radius);
    const validatedLimit = this.validateLimit(limit);

    const cacheKey = this.getCacheKey(params);
    const cached = this.locationCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const radiusInMeters = radius * 1000;
      const minDistanceInMeters = minDistance * 1000;

      const pipeline: any[] = [
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [longitude, latitude],
            },
            distanceField: "distance",
            maxDistance: radiusInMeters,
            minDistance: minDistanceInMeters,
            spherical: true,
            distanceMultiplier: 0.001,
          },
        },
        {
          $match: {
            isTrackingOn,
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
              {
                $project: {
                  _id: 1,
                  userId: 1,
                  isOnline: 1,
                  isAvailable: 1,
                  lastSeen: 1,
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
          $lookup: {
            from: "ridedrivers",
            let: { userId: "$userId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$userId", "$$userId"] },
                      { $eq: ["$status", "approved"] },
                    ],
                  },
                },
              },
              {
                $project: {
                  _id: 1,
                  userId: 1,
                  status: 1,
                },
              },
              { $limit: 1 },
            ],
            as: "driver",
          },
        },
        {
          $match: {
            "driver.0": { $exists: true },
          },
        },
        {
          $addFields: {
            driverStatus: { $arrayElemAt: ["$status", 0] },
            driverInfo: { $arrayElemAt: ["$driver", 0] },
          },
        },
        {
          $sort: {
            distance: 1,
            "driverStatus.lastSeen": -1,
            locationUpdatedAt: -1,
          },
        },
        {
          $limit: validatedLimit,
        },
        {
          $project: {
            _id: 0,
            userId: 1,
            driverCode: 1,
            distance: 1,
            "location.latitude": 1,
            "location.longitude": 1,
            "location.address": 1,
            "location.googlePlaceId": 1,
            heading: 1,
            speed: 1,
            accuracy: 1,
            bearing: 1,
            altitude: 1,
            provider: 1,
            batteryLevel: 1,
            networkType: 1,
            isMockLocation: 1,
            locationUpdatedAt: 1,
            lastSocketUpdate: 1,
            driverStatus: {
              isOnline: 1,
              isAvailable: 1,
              lastSeen: 1,
            },
          },
        },
      ];

      const drivers =
        await RideDriverLocation.aggregate<IAggregatedDriver>(pipeline);

      const result = drivers.map((driver) => ({
        userId: driver.userId,
        driverCode: driver.driverCode,
        distance: driver.distance,
        location: driver.location,
        heading: driver.heading,
        speed: driver.speed,
        accuracy: driver.accuracy,
        bearing: driver.bearing,
        altitude: driver.altitude,
        provider: driver.provider,
        batteryLevel: driver.batteryLevel,
        networkType: driver.networkType,
        isMockLocation: driver.isMockLocation,
        locationUpdatedAt: driver.locationUpdatedAt,
        lastSocketUpdate: driver.lastSocketUpdate,
      }));

      this.locationCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      throw new Error(
        `Failed to find nearby drivers: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async findNearbyDriversWithFilters(
    params: ISearchParams,
    filters: {
      minRating?: number;
      vehicleType?: string[];
      minExperience?: number;
      maxDistance?: number;
    } = {},
  ): Promise<IDriverLocation[]> {
    const {
      latitude,
      longitude,
      radius,
      limit,
      isTrackingOn = true,
      minDistance = 0,
    } = params;

    this.validateCoordinates(latitude, longitude);
    this.validateRadius(radius);
    const validatedLimit = this.validateLimit(limit);

    const radiusInMeters = radius * 1000;
    const minDistanceInMeters = minDistance * 1000;

    const pipeline: any[] = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          distanceField: "distance",
          maxDistance: radiusInMeters,
          minDistance: minDistanceInMeters,
          spherical: true,
          distanceMultiplier: 0.001,
        },
      },
      {
        $match: {
          isTrackingOn,
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
        $lookup: {
          from: "ridedrivers",
          let: { userId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$userId", "$$userId"] },
                    { $eq: ["$status", "approved"] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "driver",
        },
      },
      {
        $match: {
          "driver.0": { $exists: true },
        },
      },
    ];

    if (filters.minRating !== undefined) {
      pipeline.push({
        $lookup: {
          from: "ridedriverratings",
          let: { userId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$driverId", "$$userId"],
                },
              },
            },
            {
              $group: {
                _id: null,
                avgRating: { $avg: "$rating" },
              },
            },
          ],
          as: "ratings",
        },
      });

      pipeline.push({
        $addFields: {
          driverRating: { $arrayElemAt: ["$ratings", 0] },
        },
      });

      pipeline.push({
        $match: {
          $expr: {
            $gte: ["$driverRating.avgRating", filters.minRating],
          },
        },
      });
    }

    if (filters.vehicleType && filters.vehicleType.length > 0) {
      pipeline.push({
        $match: {
          "driver.vehicleType": { $in: filters.vehicleType },
        },
      });
    }

    if (filters.maxDistance !== undefined) {
      pipeline.push({
        $match: {
          distance: { $lte: filters.maxDistance },
        },
      });
    }

    pipeline.push(
      {
        $sort: {
          distance: 1,
        },
      },
      {
        $limit: validatedLimit,
      },
      {
        $project: {
          _id: 0,
          userId: 1,
          driverCode: 1,
          distance: 1,
          "location.latitude": 1,
          "location.longitude": 1,
          heading: 1,
          speed: 1,
          accuracy: 1,
          bearing: 1,
          altitude: 1,
          provider: 1,
          batteryLevel: 1,
          networkType: 1,
          isMockLocation: 1,
          locationUpdatedAt: 1,
          lastSocketUpdate: 1,
        },
      },
    );

    const drivers =
      await RideDriverLocation.aggregate<IAggregatedDriver>(pipeline);

    return drivers.map((driver) => ({
      userId: driver.userId,
      driverCode: driver.driverCode,
      distance: driver.distance,
      location: driver.location,
      heading: driver.heading,
      speed: driver.speed,
      accuracy: driver.accuracy,
      bearing: driver.bearing,
      altitude: driver.altitude,
      provider: driver.provider,
      batteryLevel: driver.batteryLevel,
      networkType: driver.networkType,
      isMockLocation: driver.isMockLocation,
      locationUpdatedAt: driver.locationUpdatedAt,
      lastSocketUpdate: driver.lastSocketUpdate,
    }));
  }

  async getDriverLocation(
    userId: string | mongoose.Types.ObjectId,
  ): Promise<IDriverLocation> {
    const validatedUserId = this.validateObjectId(userId);

    const location = await RideDriverLocation.findOne({
      userId: validatedUserId,
    })
      .lean()
      .exec();

    if (!location) {
      throw new Error(`Driver location not found for user: ${validatedUserId}`);
    }

    return {
      userId: location.userId,
      driverCode: location.driverCode || location.userId.toString(),
      distance: 0,
      location: {
        latitude: location.location?.latitude || 0,
        longitude: location.location?.longitude || 0,
      },
      heading: location.heading,
      speed: location.speed,
      accuracy: location.accuracy,
      bearing: location.bearing,
      altitude: location.altitude,
      provider: location.provider,
      batteryLevel: location.batteryLevel,
      networkType: location.networkType,
      isMockLocation: location.isMockLocation,
      locationUpdatedAt: location.locationUpdatedAt,
      lastSocketUpdate: location.lastSocketUpdate,
    };
  }

  async getDriverLocations(
    userIds: (string | mongoose.Types.ObjectId)[],
  ): Promise<IDriverLocation[]> {
    if (!userIds || userIds.length === 0) {
      return [];
    }

    const validatedUserIds = userIds.map((id) => this.validateObjectId(id));

    const locations = await RideDriverLocation.find({
      userId: { $in: validatedUserIds },
      isTrackingOn: true,
    })
      .lean()
      .exec();

    return locations.map((location) => ({
      userId: location.userId,
      driverCode: location.driverCode || location.userId.toString(),
      distance: 0,
      location: {
        latitude: location.location?.latitude || 0,
        longitude: location.location?.longitude || 0,
      },
      heading: location.heading,
      speed: location.speed,
      accuracy: location.accuracy,
      bearing: location.bearing,
      altitude: location.altitude,
      provider: location.provider,
      batteryLevel: location.batteryLevel,
      networkType: location.networkType,
      isMockLocation: location.isMockLocation,
      locationUpdatedAt: location.locationUpdatedAt,
      lastSocketUpdate: location.lastSocketUpdate,
    }));
  }

  async updateDriverLocation(
    userId: string | mongoose.Types.ObjectId,
    locationData: ILocationData,
  ): Promise<IDriverLocation> {
    const validatedUserId = this.validateObjectId(userId);

    this.validateCoordinates(locationData.latitude, locationData.longitude);

    const now = new Date();

    const location = await RideDriverLocation.findOneAndUpdate(
      { userId: validatedUserId },
      {
        $set: {
          location: {
            type: "Point",
            coordinates: [locationData.longitude, locationData.latitude],
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            address: locationData.address || "",
            googlePlaceId: locationData.googlePlaceId || "",
          },
          heading: locationData.heading,
          speed: locationData.speed,
          accuracy: locationData.accuracy,
          bearing: locationData.bearing,
          altitude: locationData.altitude,
          provider: locationData.provider,
          batteryLevel: locationData.batteryLevel,
          networkType: locationData.networkType,
          isMockLocation: locationData.isMockLocation || false,
          locationUpdatedAt: now,
          lastSocketUpdate: now,
        },
        $setOnInsert: {
          userId: validatedUserId,
          driverCode: validatedUserId.toString(),
          isTrackingOn: true,
          createdAt: now,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: true,
      },
    );

    if (!location) {
      throw new Error(
        `Failed to update driver location for user: ${validatedUserId}`,
      );
    }

    return {
      userId: location.userId,
      driverCode: location.driverCode || location.userId.toString(),
      distance: 0,
      location: {
        latitude: location.location?.latitude || 0,
        longitude: location.location?.longitude || 0,
      },
      heading: location.heading,
      speed: location.speed,
      accuracy: location.accuracy,
      bearing: location.bearing,
      altitude: location.altitude,
      provider: location.provider,
      batteryLevel: location.batteryLevel,
      networkType: location.networkType,
      isMockLocation: location.isMockLocation,
      locationUpdatedAt: location.locationUpdatedAt,
      lastSocketUpdate: location.lastSocketUpdate,
    };
  }

  async getNearbyDriverCount(
    latitude: number,
    longitude: number,
    radius: number,
  ): Promise<number> {
    this.validateCoordinates(latitude, longitude);
    this.validateRadius(radius);

    const radiusInMeters = radius * 1000;

    const result = await RideDriverLocation.aggregate([
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
        $lookup: {
          from: "ridedrivers",
          let: { userId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$userId", "$$userId"] },
                    { $eq: ["$status", "approved"] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "driver",
        },
      },
      {
        $match: {
          "driver.0": { $exists: true },
        },
      },
      {
        $count: "total",
      },
    ]);

    return result.length > 0 ? result[0].total : 0;
  }

  async getDriverLocationHistory(
    userId: string | mongoose.Types.ObjectId,
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    } = {},
  ): Promise<IDriverLocation[]> {
    const validatedUserId = this.validateObjectId(userId);
    const limit = Math.min(options.limit || 50, 100);

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

    const locations = await RideDriverLocation.find(query)
      .sort({ locationUpdatedAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return locations.map((location) => ({
      userId: location.userId,
      driverCode: location.driverCode || location.userId.toString(),
      distance: 0,
      location: {
        latitude: location.location?.latitude || 0,
        longitude: location.location?.longitude || 0,
      },
      heading: location.heading,
      speed: location.speed,
      accuracy: location.accuracy,
      bearing: location.bearing,
      altitude: location.altitude,
      provider: location.provider,
      batteryLevel: location.batteryLevel,
      networkType: location.networkType,
      isMockLocation: location.isMockLocation,
      locationUpdatedAt: location.locationUpdatedAt,
      lastSocketUpdate: location.lastSocketUpdate,
    }));
  }

  async markDriverInactive(
    userId: string | mongoose.Types.ObjectId,
  ): Promise<void> {
    const validatedUserId = this.validateObjectId(userId);

    await RideDriverLocation.findOneAndUpdate(
      { userId: validatedUserId },
      {
        $set: {
          isTrackingOn: false,
          locationUpdatedAt: new Date(),
        },
      },
      {
        runValidators: true,
      },
    );
  }

  async cleanupStaleLocations(maxAgeMinutes: number = 60): Promise<number> {
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    const result = await RideDriverLocation.deleteMany({
      locationUpdatedAt: { $lt: cutoffTime },
      isTrackingOn: false,
    });

    return result.deletedCount || 0;
  }

  clearCache(): void {
    this.locationCache.clear();
  }

  private getCacheKey(params: ISearchParams): string {
    return `${params.latitude},${params.longitude},${params.radius},${params.limit},${params.isTrackingOn}`;
  }

  private validateCoordinates(latitude: number, longitude: number): void {
    if (typeof latitude !== "number" || isNaN(latitude)) {
      throw new Error(`Invalid latitude: ${latitude}`);
    }

    if (typeof longitude !== "number" || isNaN(longitude)) {
      throw new Error(`Invalid longitude: ${longitude}`);
    }

    if (latitude < -90 || latitude > 90) {
      throw new Error(`Latitude must be between -90 and 90: ${latitude}`);
    }

    if (longitude < -180 || longitude > 180) {
      throw new Error(`Longitude must be between -180 and 180: ${longitude}`);
    }
  }

  private validateRadius(radius: number): void {
    if (typeof radius !== "number" || isNaN(radius) || radius <= 0) {
      throw new Error(`Invalid radius: ${radius}`);
    }

    if (radius < this.MIN_RADIUS_KM) {
      throw new Error(`Radius must be at least ${this.MIN_RADIUS_KM} KM`);
    }

    if (radius > this.MAX_RADIUS_KM) {
      throw new Error(`Radius must be at most ${this.MAX_RADIUS_KM} KM`);
    }
  }

  private validateLimit(limit?: number): number {
    if (limit === undefined || limit === null) {
      return this.DEFAULT_LIMIT;
    }

    if (typeof limit !== "number" || isNaN(limit) || limit <= 0) {
      return this.DEFAULT_LIMIT;
    }

    return Math.min(limit, this.MAX_LIMIT);
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
}
