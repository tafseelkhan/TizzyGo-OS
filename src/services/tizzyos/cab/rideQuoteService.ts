// services/tizzyos/cab/RideQuoteService.ts - COMPLETE FINAL

import mongoose from "mongoose";
import { GoogleRoutesService } from "../../../interfaces/route/GoogleRoutesService";
import { FareCalculationService } from "../../../interfaces/route/fare/FareCalculationService";
import RideType from "../../../models/tizzyos/cab/rideType";
import RideDriver from "../../../models/tizzyos/cab/rideDriver";
import RideDriverStatus from "../../../models/tizzyos/cab/rideDriverStatus";
import RideDriverLocation from "../../../models/tizzyos/cab/rideDriverLocation";
import RideQuote from "../../../models/tizzyos/cab/rideQuote";
import { generateQuoteCode } from "../../../utils/tizzyos/cab/idGenerator";
import { v4 as uuidv4 } from "uuid";

interface IQuoteRequest {
  pickup: {
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId: string;
  };
  drop: {
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId: string;
  };
}

interface IDriverInfo {
  userId: mongoose.Types.ObjectId;
  driverCode: string;
  isOnline: boolean;
  isAvailable: boolean;
  isTrackingOn: boolean;
  speed?: number;
  heading?: number;
  location: {
    latitude: number;
    longitude: number;
  };
  distance: number;
  driverRideTypeCode: string;
  vehicleClassRideTypes: string[];
  vehicle: {
    categoryCode: string;
    companyCode: string;
    modelCode: string;
    vehicleNumber: string;
    vehicleColor: string;
    maxPassengers: number;
    vehicleClass?: string;
    baseFare?: number;
    classFare?: number;
    vehicleType?: string;
    hasAC?: boolean;
    luggageCapacity?: number;
    handBagCapacity?: number;
    seatCapacity?: number;
    passengerCapacity?: number;
    manufacturingYear?: number;
  };
}

interface IDriverResponse {
  driverId: string;
  driverCode: string;
  vehicle: string;
  vehicleClass: string;
  vehicleNumber: string;
  vehicleColor: string;
  latestLatitude: number;
  latestLongitude: number;
  heading: number;
  speed: number;
  distance: number;
  isOnline: boolean;
  isAvailable: boolean;
  isTrackingOn: boolean;
  maxPassengers: number;
  hasAC: boolean;
  luggageCapacity: number;
  handBagCapacity: number;
  seatCapacity: number;
  passengerCapacity: number;
  baseFare: number;
  classFare: number;
  vehicleType: string;
  manufacturingYear?: number;
}

interface IRideTypeGroupResponse {
  rideType: string;
  estimatedFare: number;
  description: string;
  pickupToDropPolyline: string;
  roadDistanceKm: number;
  trafficDurationMinutes: number;
  drivers: IDriverResponse[];
  quoteId?: string;
}

export class RideQuoteService {
  private readonly routeService: GoogleRoutesService;
  private readonly fareService: FareCalculationService;
  private readonly candidateCache: Map<
    string,
    { driverId: string; expiresAt: Date }
  >;

  private readonly MIN_SEARCH_RADIUS_KM: number = 0;
  private readonly MAX_SEARCH_RADIUS_KM: number = 80;
  private readonly MAX_DRIVERS_TO_FETCH: number = 30;

  constructor() {
    this.routeService = new GoogleRoutesService();
    this.fareService = new FareCalculationService();
    this.candidateCache = new Map();
  }

  async getRideOptions(
    quoteRequest: IQuoteRequest,
  ): Promise<IRideTypeGroupResponse[]> {
    console.log("=========================================");
    console.log("🚗 GET RIDE OPTIONS STARTED");
    console.log("=========================================");

    this.validateLocation(quoteRequest.pickup);
    this.validateLocation(quoteRequest.drop);

    console.log("📍 Pickup Location:", {
      lat: quoteRequest.pickup.latitude,
      lng: quoteRequest.pickup.longitude,
      address: quoteRequest.pickup.address,
    });
    console.log("📍 Drop Location:", {
      lat: quoteRequest.drop.latitude,
      lng: quoteRequest.drop.longitude,
      address: quoteRequest.drop.address,
    });

    const nearbyDrivers = await this.findNearbyAvailableDrivers(
      quoteRequest.pickup.latitude,
      quoteRequest.pickup.longitude,
      this.MIN_SEARCH_RADIUS_KM,
      this.MAX_SEARCH_RADIUS_KM,
      this.MAX_DRIVERS_TO_FETCH,
    );

    if (nearbyDrivers.length === 0) {
      throw new Error("No drivers available nearby. Please try again later.");
    }

    console.log(`✅ Found ${nearbyDrivers.length} nearby drivers`);

    const route = await this.routeService.getRoute({
      origin: {
        latitude: quoteRequest.pickup.latitude,
        longitude: quoteRequest.pickup.longitude,
        address: quoteRequest.pickup.address,
      },
      destination: {
        latitude: quoteRequest.drop.latitude,
        longitude: quoteRequest.drop.longitude,
        address: quoteRequest.drop.address,
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    });

    console.log("🗺️ Main Route Data:", {
      roadDistanceKm: route.roadDistanceKm,
      normalDurationMinutes: route.normalDurationMinutes,
      trafficDurationMinutes: route.trafficDurationMinutes,
      encodedPolyline: route.encodedPolyline
        ? `${route.encodedPolyline.substring(0, 50)}...`
        : "N/A",
    });

    const allRideTypes = await RideType.find().lean().exec();

    if (!allRideTypes || allRideTypes.length === 0) {
      throw new Error("No ride types found in database");
    }

    console.log(`✅ Found ${allRideTypes.length} ride types from DB`);

    const rideTypeGroups = new Map<
      string,
      {
        rideType: any;
        drivers: IDriverInfo[];
        fare: number;
      }
    >();

    for (const driver of nearbyDrivers) {
      const driverVehicleClass = driver.vehicle.vehicleClass || "Economy";
      const vehicleClassMatchingTypes = allRideTypes.filter(
        (rt) =>
          rt.vehicleClasses && rt.vehicleClasses.includes(driverVehicleClass),
      );
      const vehicleClassRideCodes = vehicleClassMatchingTypes.map(
        (rt) => rt.code,
      );

      const driverRideTypeCode = driver.driverRideTypeCode;

      let matchedRideTypes: string[] = [];

      if (
        driverRideTypeCode &&
        vehicleClassRideCodes.includes(driverRideTypeCode)
      ) {
        matchedRideTypes = [driverRideTypeCode];
      } else {
        matchedRideTypes = vehicleClassRideCodes;
      }

      if (matchedRideTypes.length === 0) {
        continue;
      }

      for (const rideTypeCode of matchedRideTypes) {
        const rideType = allRideTypes.find((rt) => rt.code === rideTypeCode);
        if (!rideType) {
          continue;
        }

        const fareComponents = this.fareService.calculateFare({
          vehicle: {
            categoryCode: driver.vehicle.categoryCode || "TWOWHEELER",
            companyCode: driver.vehicle.companyCode || "HERO",
            modelCode: driver.vehicle.modelCode || "SPLENDORPLUS",
            vehicleType: driver.vehicle.vehicleType || "Bike",
            vehicleClass: driverVehicleClass,
            baseFare: driver.vehicle.baseFare || 50,
            classFare: driver.vehicle.classFare || 20,
            maxPassengers: driver.vehicle.maxPassengers || 1,
          },
          roadDistanceKm: route.roadDistanceKm,
          trafficDurationMinutes: route.trafficDurationMinutes,
        });

        const fare = Math.round(fareComponents.totalFare);

        if (!rideTypeGroups.has(rideTypeCode)) {
          rideTypeGroups.set(rideTypeCode, {
            rideType: rideType,
            drivers: [],
            fare: fare,
          });
        }

        const group = rideTypeGroups.get(rideTypeCode)!;
        group.drivers.push(driver);
        if (fare < group.fare) {
          group.fare = fare;
        }
      }
    }

    const response: IRideTypeGroupResponse[] = [];

    for (const [rideTypeCode, group] of rideTypeGroups) {
      const sortedDrivers = group.drivers
        .sort((a, b) => (a.distance || 0) - (b.distance || 0))
        .slice(0, 6);

      const driverResponses: IDriverResponse[] = sortedDrivers.map(
        (driver) => ({
          driverId: driver.userId.toString(),
          driverCode: driver.driverCode,
          vehicle: driver.vehicle.vehicleType || "Bike",
          vehicleClass: driver.vehicle.vehicleClass || "Economy",
          vehicleNumber: driver.vehicle.vehicleNumber,
          vehicleColor: driver.vehicle.vehicleColor,
          latestLatitude: driver.location.latitude,
          latestLongitude: driver.location.longitude,
          heading: driver.heading || 0,
          speed: driver.speed || 0,
          distance: Math.round((driver.distance || 0) * 10) / 10,
          isOnline: driver.isOnline,
          isAvailable: driver.isAvailable,
          isTrackingOn: driver.isTrackingOn,
          maxPassengers: driver.vehicle.maxPassengers || 1,
          hasAC: driver.vehicle.hasAC || false,
          luggageCapacity: driver.vehicle.luggageCapacity || 0,
          handBagCapacity: driver.vehicle.handBagCapacity || 1,
          seatCapacity: driver.vehicle.seatCapacity || 2,
          passengerCapacity: driver.vehicle.passengerCapacity || 1,
          baseFare: driver.vehicle.baseFare || 50,
          classFare: driver.vehicle.classFare || 20,
          vehicleType: driver.vehicle.vehicleType || "Bike",
          manufacturingYear: driver.vehicle.manufacturingYear,
        }),
      );

      const quoteId = generateQuoteCode();

      try {
        const firstDriver = sortedDrivers[0];

        const fareComponents = this.fareService.calculateFare({
          vehicle: {
            categoryCode: firstDriver?.vehicle.categoryCode || "TWOWHEELER",
            companyCode: firstDriver?.vehicle.companyCode || "HERO",
            modelCode: firstDriver?.vehicle.modelCode || "SPLENDORPLUS",
            vehicleType: firstDriver?.vehicle.vehicleType || "Bike",
            vehicleClass: firstDriver?.vehicle.vehicleClass || "Economy",
            baseFare: firstDriver?.vehicle.baseFare || 50,
            classFare: firstDriver?.vehicle.classFare || 20,
            maxPassengers: firstDriver?.vehicle.maxPassengers || 1,
          },
          roadDistanceKm: route.roadDistanceKm,
          trafficDurationMinutes: route.trafficDurationMinutes,
        });

        const quote = new RideQuote({
          quoteId: quoteId,
          rideType: group.rideType.name,
          rideTypeCode: rideTypeCode,
          totalFare: group.fare,
          pickup: {
            latitude: quoteRequest.pickup.latitude,
            longitude: quoteRequest.pickup.longitude,
            address: quoteRequest.pickup.address || "Unknown",
            googlePlaceId: quoteRequest.pickup.googlePlaceId || "N/A",
          },
          drop: {
            latitude: quoteRequest.drop.latitude,
            longitude: quoteRequest.drop.longitude,
            address: quoteRequest.drop.address || "Unknown",
            googlePlaceId: quoteRequest.drop.googlePlaceId || "N/A",
          },
          routeData: {
            roadDistanceKm: route.roadDistanceKm || 0,
            trafficDurationMinutes: route.trafficDurationMinutes || 0,
            normalDurationMinutes: route.normalDurationMinutes || 0,
            encodedPolyline: route.encodedPolyline || "",
            routeSummary: {
              startAddress: quoteRequest.pickup.address || "Unknown",
              endAddress: quoteRequest.drop.address || "Unknown",
              distanceText: `${route.roadDistanceKm || 0} km`,
              durationText: `${Math.round(route.trafficDurationMinutes || 0)} min`,
              steps: [], // ✅ Empty array for steps
            },
          },
          fareComponents: {
            baseFare: fareComponents.baseFare || 0,
            classFare: fareComponents.classFare || 0,
            distanceFare: fareComponents.distanceFare || 0,
            timeFare: fareComponents.timeFare || 0,
            platformFees: fareComponents.platformFees || 0,
            subTotal: fareComponents.subTotal || 0,
            gstFare: fareComponents.gstFare || 0,
            totalFare: group.fare || 0,
            gstPercentage: fareComponents.gstPercentage || 18,
            perKmRate: fareComponents.perKmRate || 5,
            perMinuteRate: fareComponents.perMinuteRate || 0.6,
          },
          vehicle: {
            categoryCode: firstDriver?.vehicle.categoryCode || "TWOWHEELER",
            companyCode: firstDriver?.vehicle.companyCode || "HERO",
            modelCode: firstDriver?.vehicle.modelCode || "SPLENDORPLUS",
            vehicleType: firstDriver?.vehicle.vehicleType || "Bike",
            class: firstDriver?.vehicle.vehicleClass || "Economy",
            baseFare: firstDriver?.vehicle.baseFare || 50,
            classFare: firstDriver?.vehicle.classFare || 20,
            maxPassengers: firstDriver?.vehicle.maxPassengers || 1,
          },
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          isUsed: false,
        });

        await quote.save();
        console.log(`✅ Quote saved: ${quoteId} for ${group.rideType.name}`);
      } catch (error: any) {
        console.error(`❌ Failed to save quote:`, error.message);
      }

      response.push({
        rideType: group.rideType.name,
        estimatedFare: group.fare,
        description: group.rideType.description || "",
        pickupToDropPolyline: route.encodedPolyline || "",
        roadDistanceKm: route.roadDistanceKm,
        trafficDurationMinutes: route.trafficDurationMinutes,
        drivers: driverResponses,
        quoteId: quoteId,
      });
    }

    if (response.length === 0) {
      throw new Error(
        "No ride types available with nearby drivers. Please try again.",
      );
    }

    response.sort((a, b) => a.estimatedFare - b.estimatedFare);

    console.log("=========================================");
    console.log("📤 FINAL RESPONSE TO FRONTEND");
    console.log("=========================================");
    console.log(`✅ Returning ${response.length} ride type groups`);
    response.forEach((group, idx) => {
      console.log(
        `   ${idx + 1}. ${group.rideType} - ₹${group.estimatedFare} - ${group.drivers.length} drivers - QuoteId: ${group.quoteId}`,
      );
    });
    console.log("=========================================");

    return response;
  }

  private async findNearbyAvailableDrivers(
    latitude: number,
    longitude: number,
    minRadiusKm: number,
    maxRadiusKm: number,
    limit: number = 30,
  ): Promise<IDriverInfo[]> {
    const minRadiusInMeters = minRadiusKm * 1000;
    const maxRadiusInMeters = maxRadiusKm * 1000;

    const locations = await RideDriverLocation.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          distanceField: "distance",
          minDistance: minRadiusInMeters,
          maxDistance: maxRadiusInMeters,
          spherical: true,
          distanceMultiplier: 0.001,
        },
      },
      {
        $match: {
          isTrackingOn: true,
        },
      },
      {
        $project: {
          userId: 1,
          driverCode: 1,
          distance: 1,
          location: 1,
          speed: 1,
          heading: 1,
          isTrackingOn: 1,
        },
      },
      { $sort: { distance: 1 } },
      { $limit: limit },
    ]);

    if (locations.length === 0) {
      return [];
    }

    const userIds = locations.map((loc) => loc.userId);

    const statuses = await RideDriverStatus.find({
      userId: { $in: userIds },
      isOnline: true,
      isAvailable: true,
    }).lean();

    const onlineUserIds = new Set(statuses.map((s) => s.userId.toString()));

    const drivers = await RideDriver.find({
      userId: { $in: userIds },
      status: "approved",
    }).lean();

    const approvedUserIds = new Set(drivers.map((d) => d.userId.toString()));

    const result: IDriverInfo[] = [];

    for (const loc of locations) {
      const userIdStr = loc.userId.toString();

      if (!approvedUserIds.has(userIdStr)) {
        continue;
      }

      if (!onlineUserIds.has(userIdStr)) {
        continue;
      }

      const driver = drivers.find((d) => d.userId.toString() === userIdStr);
      if (!driver) {
        continue;
      }

      const status = statuses.find((s) => s.userId.toString() === userIdStr);
      if (!status) {
        continue;
      }

      const driverRideTypeCode = driver.rideTypeCode || "";
      const driverVehicleClass = driver.vehicle.vehicleClass || "Economy";

      const distance = loc.distance || 0;

      result.push({
        userId: loc.userId,
        driverCode: driver.driverCode,
        isOnline: status.isOnline,
        isAvailable: status.isAvailable,
        isTrackingOn: loc.isTrackingOn,
        speed: loc.speed,
        heading: loc.heading,
        location: {
          latitude: loc.location.latitude,
          longitude: loc.location.longitude,
        },
        distance: distance,
        driverRideTypeCode: driverRideTypeCode,
        vehicleClassRideTypes: [],
        vehicle: {
          categoryCode: driver.vehicle.categoryCode,
          companyCode: driver.vehicle.companyCode,
          modelCode: driver.vehicle.modelCode,
          vehicleNumber: driver.vehicle.vehicleNumber,
          vehicleColor: driver.vehicle.vehicleColor,
          maxPassengers: driver.vehicle.maxPassengers,
          vehicleClass: driverVehicleClass,
          baseFare: driver.vehicle.baseFare || 50,
          classFare: driver.vehicle.classFare || 20,
          vehicleType: driver.vehicle.vehicleType || "Bike",
          hasAC: driver.vehicle.hasAC || false,
          luggageCapacity: driver.vehicle.luggageCapacity || 0,
          handBagCapacity: driver.vehicle.handBagCapacity || 1,
          seatCapacity: driver.vehicle.seatCapacity || 2,
          passengerCapacity: driver.vehicle.passengerCapacity || 1,
          manufacturingYear: driver.vehicle.manufacturingYear,
        },
      });
    }

    return result;
  }

  private generateCandidateId(): string {
    return uuidv4();
  }

  private validateLocation(location: any): void {
    if (!location) {
      throw new Error("Location is required");
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
  }

  storeCandidateMapping(candidateId: string, driverId: string): void {
    this.candidateCache.set(candidateId, {
      driverId,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
  }

  getCandidateMapping(candidateId: string): string | null {
    const mapping = this.candidateCache.get(candidateId);
    if (!mapping) return null;
    if (mapping.expiresAt < new Date()) {
      this.candidateCache.delete(candidateId);
      return null;
    }
    return mapping.driverId;
  }

  clearExpiredCandidates(): void {
    const now = new Date();
    for (const [key, value] of this.candidateCache) {
      if (value.expiresAt < now) {
        this.candidateCache.delete(key);
      }
    }
  }
}
