import mongoose from "mongoose";
import Districts, { IDistricts } from "../../../models/tizzyos/cab/district";
import RideDriverLocation from "../../../models/tizzyos/cab/rideDriverLocation";
import RideDriverStatus from "../../../models/tizzyos/cab/rideDriverStatus";
import RideDriver from "../../../models/tizzyos/cab/rideDriver";

export interface IDriverLocationInfo {
  userId: mongoose.Types.ObjectId;
  driverCode: string;
  location: {
    latitude: number;
    longitude: number;
  };
  speed?: number;
  heading?: number;
  isTrackingOn: boolean;
  distance?: number; // Distance from pickup in KM (ONLY for sorting)
}

export interface IDistrictValidationResult {
  valid: boolean;
  message?: string;
  pickupDistrict?: IDistricts;
  dropDistrict?: IDistricts;
}

export class DistrictService {
  /**
   * ✅ Find which district contains a given point
   * Uses MongoDB $geoIntersects for efficient spatial query
   *
   * CRITICAL: Uses [longitude, latitude] format (GeoJSON standard)
   */
  async findDistrictByPoint(
    latitude: number,
    longitude: number,
  ): Promise<IDistricts | null> {
    console.log(`📍 Finding district for point: (${latitude}, ${longitude})`);

    // GeoJSON Point: [longitude, latitude]
    const point = {
      type: "Point" as const,
      coordinates: [longitude, latitude],
    };

    // ✅ MongoDB $geoIntersects query - Finds which district contains this point
    const district = await Districts.findOne({
      geometry: {
        $geoIntersects: {
          $geometry: point,
        },
      },
    }).lean();

    if (district) {
      console.log(
        `🗺️ District found: ${district.name} (shapeId: ${district.shapeId})`,
      );
    } else {
      console.log(`❌ No district found for point (${latitude}, ${longitude})`);
    }

    return district;
  }

  /**
   * ✅ Validate that pickup and drop are in the SAME district
   * This is the core LocalRide business rule
   */
  async validateLocalRideDistricts(
    pickupLatitude: number,
    pickupLongitude: number,
    dropLatitude: number,
    dropLongitude: number,
  ): Promise<IDistrictValidationResult> {
    console.log(`🔍 Validating LocalRide districts...`);

    // 1. Find pickup district
    const pickupDistrict = await this.findDistrictByPoint(
      pickupLatitude,
      pickupLongitude,
    );

    if (!pickupDistrict) {
      console.log(`❌ Pickup location outside service area`);
      return {
        valid: false,
        message: "Pickup location is outside our service area.",
      };
    }

    console.log(`📍 Pickup District: ${pickupDistrict.name}`);

    // 2. Find drop district
    const dropDistrict = await this.findDistrictByPoint(
      dropLatitude,
      dropLongitude,
    );

    if (!dropDistrict) {
      console.log(`❌ Drop location outside service area`);
      return {
        valid: false,
        message: "Drop location is outside our service area.",
      };
    }

    console.log(`📍 Drop District: ${dropDistrict.name}`);

    // 3. Compare districts - MUST BE SAME for LocalRide
    if (pickupDistrict._id.toString() !== dropDistrict._id.toString()) {
      console.log(
        `❌ LocalRide rejected: pickup and drop are in different districts`,
      );
      return {
        valid: false,
        message: `Please check your pickup and drop locations. Pickup is in ${pickupDistrict.name}, while your drop location falls under ${dropDistrict.name}. Please select a drop location within the same district as your pickup. FWSLocalRide is available only for trips within the same district.`,
        pickupDistrict,
        dropDistrict,
      };
    }

    console.log(
      `✅ LocalRide district validation passed: ${pickupDistrict.name}`,
    );
    return {
      valid: true,
      message: "Pickup and drop are in the same district.",
      pickupDistrict,
      dropDistrict,
    };
  }

  /**
   * ✅ Find drivers whose current location is inside a given district polygon
   * Uses MongoDB $geoWithin for efficient spatial filtering
   *
   * CRITICAL: District geometry is the ONLY geographic filter
   * NO radius limit is applied anywhere in this method
   */
  async findDriversInsideDistrict(
    district: IDistricts,
    pickupLatitude: number,
    pickupLongitude: number,
    limit: number = 30,
  ): Promise<IDriverLocationInfo[]> {
    console.log(`🚗 Searching drivers inside district: ${district.name}`);

    // ✅ STEP 1: Find all drivers with active tracking INSIDE the district polygon
    // Uses $geoWithin with the district's geometry
    // This is the PRIMARY and ONLY geographic filter
    const geoQuery = {
      location: {
        $geoWithin: {
          $geometry: district.geometry, // District polygon from MongoDB
        },
      },
      isTrackingOn: true,
    };

    const driversInDistrict = await RideDriverLocation.find(geoQuery)
      .lean()
      .exec();

    if (driversInDistrict.length === 0) {
      console.log(`📊 No drivers found inside district: ${district.name}`);
      return [];
    }

    console.log(
      `📊 Drivers geographically inside district: ${driversInDistrict.length}`,
    );

    // ✅ STEP 2: Get all userIds for status filtering
    const userIds = driversInDistrict.map((loc) => loc.userId);

    // ✅ STEP 3: Fetch driver statuses (online + available)
    const statuses = await RideDriverStatus.find({
      userId: { $in: userIds },
      isOnline: true,
      isAvailable: true,
    }).lean();

    const onlineUserIds = new Set(statuses.map((s) => s.userId.toString()));
    console.log(`🟢 Online + available: ${onlineUserIds.size}`);

    // ✅ STEP 4: Fetch driver details (approved status)
    const drivers = await RideDriver.find({
      userId: { $in: userIds },
      status: "approved",
    }).lean();

    const approvedUserIds = new Set(drivers.map((d) => d.userId.toString()));
    console.log(`✅ Approved: ${approvedUserIds.size}`);

    // ✅ STEP 5: Build result with distance calculation for sorting
    const result: IDriverLocationInfo[] = [];

    for (const loc of driversInDistrict) {
      const userIdStr = loc.userId.toString();

      // Apply online + available filter
      if (!onlineUserIds.has(userIdStr)) {
        continue;
      }

      // Apply approved filter
      if (!approvedUserIds.has(userIdStr)) {
        continue;
      }

      // ✅ Distance is calculated ONLY for sorting
      // It does NOT affect eligibility
      const distance = this.calculateDistance(
        pickupLatitude,
        pickupLongitude,
        loc.location.latitude,
        loc.location.longitude,
      );

      result.push({
        userId: loc.userId,
        driverCode: loc.driverCode,
        location: {
          latitude: loc.location.latitude,
          longitude: loc.location.longitude,
        },
        speed: loc.speed,
        heading: loc.heading,
        isTrackingOn: loc.isTrackingOn,
        distance: distance, // ONLY for sorting
      });
    }

    // ✅ STEP 6: Sort by distance (nearest first)
    // Distance is ONLY used for sorting, NOT eligibility
    result.sort((a, b) => (a.distance || 0) - (b.distance || 0));

    // ✅ STEP 7: Apply limit (safety limit, NOT radius)
    const limitedResult = result.slice(0, limit);

    console.log(
      `✅ Final eligible drivers inside district: ${limitedResult.length}`,
    );
    if (limitedResult.length > 0) {
      console.log(
        `📏 Nearest driver is ${limitedResult[0].distance?.toFixed(2)} KM away`,
      );
      console.log(
        `📏 Farthest driver (included) is ${limitedResult[limitedResult.length - 1].distance?.toFixed(2)} KM away`,
      );
    }

    return limitedResult;
  }

  /**
   * ✅ Calculate distance between two points using Haversine formula
   * Returns distance in kilometers
   *
   * NOTE: This is ONLY for sorting, NOT for eligibility
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * ✅ Utility method to check if a point is inside a district
   */
  async isPointInsideDistrict(
    latitude: number,
    longitude: number,
    districtId: string,
  ): Promise<boolean> {
    const point = {
      type: "Point" as const,
      coordinates: [longitude, latitude],
    };

    const result = await Districts.findOne({
      _id: districtId,
      geometry: {
        $geoIntersects: {
          $geometry: point,
        },
      },
    });

    return !!result;
  }

  /**
   * ✅ Validate driver district at booking/accept time
   * This ensures driver hasn't moved to another district
   */
  async validateDriverDistrictForBooking(
    customerPickupLat: number,
    customerPickupLng: number,
    customerDropLat: number,
    customerDropLng: number,
    driverUserId: mongoose.Types.ObjectId | string,
  ): Promise<{ valid: boolean; message?: string; districtName?: string }> {
    // 1. First validate pickup and drop are in same district
    const districtValidation = await this.validateLocalRideDistricts(
      customerPickupLat,
      customerPickupLng,
      customerDropLat,
      customerDropLng,
    );

    if (!districtValidation.valid) {
      return {
        valid: false,
        message: districtValidation.message,
      };
    }

    const customerDistrict = districtValidation.pickupDistrict!;

    // 2. Get driver's current location
    const driverLocation = await RideDriverLocation.findOne({
      userId: driverUserId,
      isTrackingOn: true,
    });

    if (!driverLocation) {
      return {
        valid: false,
        message: "Driver location is not available.",
      };
    }

    // 3. Check if driver is in the same district
    const isDriverInside = await this.isPointInsideDistrict(
      driverLocation.location.latitude,
      driverLocation.location.longitude,
      customerDistrict._id.toString(),
    );

    if (!isDriverInside) {
      return {
        valid: false,
        message: `Driver is no longer in ${customerDistrict.name} district.`,
        districtName: customerDistrict.name,
      };
    }

    // 4. Check driver statuses
    const status = await RideDriverStatus.findOne({
      userId: driverUserId,
      isOnline: true,
      isAvailable: true,
    });

    if (!status) {
      return { valid: false, message: "Driver is not available." };
    }

    const driver = await RideDriver.findOne({
      userId: driverUserId,
      status: "approved",
    });

    if (!driver) {
      return { valid: false, message: "Driver is not approved." };
    }

    return {
      valid: true,
      message: "Driver is eligible for this booking.",
      districtName: customerDistrict.name,
    };
  }
}
