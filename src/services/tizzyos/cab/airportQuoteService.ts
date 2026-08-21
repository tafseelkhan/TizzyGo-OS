import mongoose from "mongoose";
import { GoogleRoutesService } from "../../../interfaces/route/GoogleRoutesService";
import { AirportFareCalculationService } from "../../../interfaces/route/fare/AirportFareCalculationService";
import AirportQuote from "../../../models/tizzyos/cab/airportQuote";
import RideType from "../../../models/tizzyos/cab/rideType";
import RideDriver from "../../../models/tizzyos/cab/rideDriver";
import RideDriverStatus from "../../../models/tizzyos/cab/rideDriverStatus";
import RideDriverLocation from "../../../models/tizzyos/cab/rideDriverLocation";
import { generateAirportQuoteId } from "../../../utils/tizzyos/cab/idGenerator";
import {
  validateCoordinates,
  validateAirportRequirement,
} from "../../../utils/tizzyos/cab/airportDetector";


interface IAirportQuoteRequest {
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
  tripType: "AIRPORT_TO_LOCATION" | "LOCATION_TO_AIRPORT";
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

interface IAirportDriverResponse {
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

interface IAirportRideTypeGroupResponse {
  rideType: string;
  estimatedFare: number;
  description: string;
  pickupToDropPolyline: string;
  roadDistanceKm: number;
  trafficDurationMinutes: number;
  drivers: IAirportDriverResponse[];
  quoteId?: string;
  // ✅ NEW: Airport detection info
  pickupIsAirport?: boolean;
  dropIsAirport?: boolean;
  airportName?: string;
}

export class AirportQuoteService {
  private readonly routeService: GoogleRoutesService;
  private readonly fareService: AirportFareCalculationService;
  private readonly MAX_DRIVERS_TO_FETCH: number = 30;

  constructor() {
    this.routeService = new GoogleRoutesService();
    this.fareService = new AirportFareCalculationService();
  }

  /**
   * ✅ Get Airport ride options
   * 
   * CHANGES:
   * 1. Added airport detection using MongoDB $geoIntersects
   * 2. Validates that at least one location is inside an airport
   * 3. Preserves all existing fare/routing logic
   */
  async getAirportRideOptions(
    quoteRequest: IAirportQuoteRequest,
    customerId: string | mongoose.Types.ObjectId,
  ): Promise<IAirportRideTypeGroupResponse[]> {
    console.log("=========================================");
    console.log("✈️ GET AIRPORT RIDE OPTIONS STARTED");
    console.log("=========================================");

    // ✅ STEP 1: Validate coordinates with proper type checking
    const pickupValidation = validateCoordinates(
      quoteRequest.pickup.latitude,
      quoteRequest.pickup.longitude,
      "Pickup"
    );
    const dropValidation = validateCoordinates(
      quoteRequest.drop.latitude,
      quoteRequest.drop.longitude,
      "Drop"
    );

    if (!pickupValidation.isValid) {
      throw new Error(
        `Invalid pickup coordinates: ${pickupValidation.errors?.join(", ")}`
      );
    }
    if (!dropValidation.isValid) {
      throw new Error(
        `Invalid drop coordinates: ${dropValidation.errors?.join(", ")}`
      );
    }

    // Use validated coordinates
    const pickupLat = pickupValidation.latitude;
    const pickupLng = pickupValidation.longitude;
    const dropLat = dropValidation.latitude;
    const dropLng = dropValidation.longitude;

    console.log("📍 Pickup Location:", {
      lat: pickupLat,
      lng: pickupLng,
      address: quoteRequest.pickup.address,
    });
    console.log("📍 Drop Location:", {
      lat: dropLat,
      lng: dropLng,
      address: quoteRequest.drop.address,
    });
    console.log("✈️ Trip Type:", quoteRequest.tripType);

    // ✅ STEP 2: Airport Detection using MongoDB polygons
    // This is the NEW polygon-based detection
    console.log("🔍 Detecting airports using polygon boundaries...");

    const airportValidation = await validateAirportRequirement({
      pickupLatitude: pickupLat,
      pickupLongitude: pickupLng,
      dropLatitude: dropLat,
      dropLongitude: dropLng,
    });

    // Store airport info for response
    const pickupAirport = airportValidation.pickupAirport;
    const dropAirport = airportValidation.dropAirport;
    const pickupIsAirport = airportValidation.pickupIsAirport;
    const dropIsAirport = airportValidation.dropIsAirport;

    console.log(`✈️ Pickup is airport: ${pickupIsAirport}`);
    if (pickupAirport) {
      console.log(`   Airport: ${pickupAirport.airportName} (${pickupAirport.state})`);
    }

    console.log(`✈️ Drop is airport: ${dropIsAirport}`);
    if (dropAirport) {
      console.log(`   Airport: ${dropAirport.airportName} (${dropAirport.state})`);
    }

    // Determine which airport name to use for the response
    const airportName = pickupAirport?.airportName || dropAirport?.airportName || "Airport";

    // ✅ STEP 3: Get route information (pickup → drop)
    // Airport trips do NOT require district validation
    const route = await this.routeService.getRoute({
      origin: {
        latitude: pickupLat,
        longitude: pickupLng,
        address: quoteRequest.pickup.address,
      },
      destination: {
        latitude: dropLat,
        longitude: dropLng,
        address: quoteRequest.drop.address,
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    });

    console.log("🗺️ Route Data:", {
      roadDistanceKm: route.roadDistanceKm,
      normalDurationMinutes: route.normalDurationMinutes,
      trafficDurationMinutes: route.trafficDurationMinutes,
    });

    // ✅ STEP 4: Find eligible drivers
    // Airport drivers are NOT filtered by district
    // Instead, find drivers near pickup with reasonable proximity
    const eligibleDrivers = await this.findAirportDrivers(
      pickupLat,
      pickupLng,
    );

    if (eligibleDrivers.length === 0) {
      throw new Error(
        "No drivers available for Airport service. Please try again later.",
      );
    }

    console.log(
      `✅ Found ${eligibleDrivers.length} eligible drivers for Airport`,
    );

    // ✅ STEP 5: Get all ride types
    const allRideTypes = await RideType.find().lean().exec();
    if (!allRideTypes || allRideTypes.length === 0) {
      throw new Error("No ride types found in database");
    }

    // ✅ STEP 6: Group drivers by ride type
    const rideTypeGroups = new Map<
      string,
      {
        rideType: any;
        drivers: IDriverInfo[];
        fare: number;
      }
    >();

    for (const driver of eligibleDrivers) {
      console.log(
        `🚗 Driver ${driver.driverCode} | rideTypeCode=${driver.driverRideTypeCode} | vehicleClass=${driver.vehicle.vehicleClass || "Economy"}`,
      );

      const driverVehicleClass = driver.vehicle.vehicleClass || "Economy";

      // Get all ride types that support this vehicle class
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
        matchedRideTypes = [];
      }

      if (matchedRideTypes.length === 0) {
        console.log(
          `⏭️ Skipping driver ${driver.driverCode} - no valid ride type mapping`,
        );
        continue;
      }

      console.log(
        `🎯 Driver ${driver.driverCode} matched ride types:`,
        matchedRideTypes,
      );

      for (const rideTypeCode of matchedRideTypes) {
        const rideType = allRideTypes.find((rt) => rt.code === rideTypeCode);
        if (!rideType) {
          continue;
        }

        const fareComponents = this.fareService.calculateAirportFare({
          vehicle: {
            categoryCode: driver.vehicle.categoryCode || "CAR",
            companyCode: driver.vehicle.companyCode || "TOYOTA",
            modelCode: driver.vehicle.modelCode || "INNOVA",
            vehicleType: driver.vehicle.vehicleType || "SUV",
            vehicleClass: driverVehicleClass,
            baseFare: driver.vehicle.baseFare || 150,
            classFare: driver.vehicle.classFare || 30,
            maxPassengers: driver.vehicle.maxPassengers || 4,
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

        const alreadyAdded = group.drivers.some(
          (d) => d.userId.toString() === driver.userId.toString(),
        );

        if (!alreadyAdded) {
          console.log(
            `➕ Adding driver ${driver.driverCode} to ride type ${rideTypeCode}`,
          );
          group.drivers.push(driver);
        }

        if (fare < group.fare) {
          group.fare = fare;
        }
      }
    }

    // ✅ STEP 7: Build response with quotes
    const response: IAirportRideTypeGroupResponse[] = [];

    for (const [rideTypeCode, group] of rideTypeGroups) {
      const sortedDrivers = group.drivers
        .sort((a, b) => (a.distance || 0) - (b.distance || 0))
        .slice(0, 6);

      const driverResponses: IAirportDriverResponse[] = sortedDrivers.map(
        (driver) => ({
          driverId: driver.userId.toString(),
          driverCode: driver.driverCode,
          vehicle: driver.vehicle.vehicleType || "SUV",
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
          maxPassengers: driver.vehicle.maxPassengers || 4,
          hasAC: driver.vehicle.hasAC || false,
          luggageCapacity: driver.vehicle.luggageCapacity || 0,
          handBagCapacity: driver.vehicle.handBagCapacity || 2,
          seatCapacity: driver.vehicle.seatCapacity || 7,
          passengerCapacity: driver.vehicle.passengerCapacity || 4,
          baseFare: driver.vehicle.baseFare || 150,
          classFare: driver.vehicle.classFare || 30,
          vehicleType: driver.vehicle.vehicleType || "SUV",
          manufacturingYear: driver.vehicle.manufacturingYear,
        }),
      );

      const quoteId = generateAirportQuoteId();

      // ✅ STEP 8: Save Airport quote to database
      try {
        const firstDriver = sortedDrivers[0];

        const fareComponents = this.fareService.calculateAirportFare({
          vehicle: {
            categoryCode: firstDriver?.vehicle.categoryCode || "CAR",
            companyCode: firstDriver?.vehicle.companyCode || "TOYOTA",
            modelCode: firstDriver?.vehicle.modelCode || "INNOVA",
            vehicleType: firstDriver?.vehicle.vehicleType || "SUV",
            vehicleClass: firstDriver?.vehicle.vehicleClass || "Economy",
            baseFare: firstDriver?.vehicle.baseFare || 150,
            classFare: firstDriver?.vehicle.classFare || 30,
            maxPassengers: firstDriver?.vehicle.maxPassengers || 4,
          },
          roadDistanceKm: route.roadDistanceKm,
          trafficDurationMinutes: route.trafficDurationMinutes,
        });

        const quote = new AirportQuote({
          quoteId: quoteId,
          serviceType: "AIRPORT",
          customerId: customerId,
          tripType: quoteRequest.tripType,
          pickup: {
            latitude: pickupLat,
            longitude: pickupLng,
            address: quoteRequest.pickup.address || "Unknown",
            googlePlaceId: quoteRequest.pickup.googlePlaceId || "N/A",
          },
          drop: {
            latitude: dropLat,
            longitude: dropLng,
            address: quoteRequest.drop.address || "Unknown",
            googlePlaceId: quoteRequest.drop.googlePlaceId || "N/A",
          },
          vehicle: {
            categoryCode: firstDriver?.vehicle.categoryCode || "CAR",
            companyCode: firstDriver?.vehicle.companyCode || "TOYOTA",
            modelCode: firstDriver?.vehicle.modelCode || "INNOVA",
            vehicleType: firstDriver?.vehicle.vehicleType || "SUV",
            class: firstDriver?.vehicle.vehicleClass || "Economy",
            baseFare: firstDriver?.vehicle.baseFare || 150,
            classFare: firstDriver?.vehicle.classFare || 30,
            maxPassengers: firstDriver?.vehicle.maxPassengers || 4,
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
              steps: [],
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
            perKmRate: fareComponents.perKmRate || 8,
            perMinuteRate: fareComponents.perMinuteRate || 1.0,
          },
          totalFare: group.fare || 0,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          isUsed: false,
          // ✅ NEW: Store airport detection info
          airportInfo: {
            pickupIsAirport,
            dropIsAirport,
            airportName: airportName,
            pickupAirportId: pickupAirport?._id,
            dropAirportId: dropAirport?._id,
          },
        });

        await quote.save();
        console.log(
          `✅ Airport quote saved: ${quoteId} for ${group.rideType.name}`,
        );
      } catch (error: any) {
        console.error(`❌ Failed to save Airport quote:`, error.message);
      }

      response.push({
        rideType: group.rideType.name,
        estimatedFare: group.fare,
        description: group.rideType.description || "Airport transfer service",
        pickupToDropPolyline: route.encodedPolyline || "",
        roadDistanceKm: route.roadDistanceKm,
        trafficDurationMinutes: route.trafficDurationMinutes,
        drivers: driverResponses,
        quoteId: quoteId,
        // ✅ NEW: Include airport detection info in response
        pickupIsAirport,
        dropIsAirport,
        airportName: airportName,
      });
    }

    if (response.length === 0) {
      throw new Error(
        "No ride types available with available drivers. Please try again.",
      );
    }

    response.sort((a, b) => a.estimatedFare - b.estimatedFare);

    console.log("=========================================");
    console.log("📤 AIRPORT RESPONSE TO FRONTEND");
    console.log("=========================================");
    console.log(`✅ Returning ${response.length} ride type groups`);
    response.forEach((group, idx) => {
      console.log(
        `   ${idx + 1}. ${group.rideType} - ₹${group.estimatedFare} - ${group.drivers.length} drivers - QuoteId: ${group.quoteId}`,
      );
      console.log(
        `      Drivers: ${group.drivers.map((d) => d.driverCode).join(", ")}`,
      );
    });
    console.log("=========================================");

    return response;
  }

  /**
   * ✅ Find drivers for Airport service
   * 
   * This remains unchanged - it finds drivers based on proximity
   * The airport detection is now separate from driver finding
   */
  private async findAirportDrivers(
    pickupLatitude: number,
    pickupLongitude: number,
  ): Promise<IDriverInfo[]> {
    console.log(`✈️ Finding Airport drivers near pickup`);

    const SEARCH_RADIUS_KM = 20;
    const searchRadiusRadians = SEARCH_RADIUS_KM / 6378.1;

    const driversNearPickup = await RideDriverLocation.find({
      location: {
        $geoWithin: {
          $centerSphere: [
            [pickupLongitude, pickupLatitude],
            searchRadiusRadians,
          ],
        },
      },
      isTrackingOn: true,
    }).lean();

    if (driversNearPickup.length === 0) {
      console.log(`❌ No Airport drivers found near pickup`);
      return [];
    }

    console.log(`✅ Found ${driversNearPickup.length} drivers near pickup`);

    const userIds = driversNearPickup.map((loc) => loc.userId);

    const statuses = await RideDriverStatus.find({
      userId: { $in: userIds },
      isOnline: true,
      isAvailable: true,
    }).lean();

    const onlineUserIds = new Set(statuses.map((s) => s.userId.toString()));
    console.log(`🟢 Online + available: ${onlineUserIds.size}`);

    const drivers = await RideDriver.find({
      userId: { $in: userIds },
      status: "approved",
    }).lean();

    const approvedUserIds = new Set(drivers.map((d) => d.userId.toString()));
    console.log(`✅ Approved: ${approvedUserIds.size}`);

    const result: IDriverInfo[] = [];

    for (const loc of driversNearPickup) {
      const userIdStr = loc.userId.toString();

      if (!onlineUserIds.has(userIdStr)) continue;
      if (!approvedUserIds.has(userIdStr)) continue;

      const distance = this.calculateDistance(
        pickupLatitude,
        pickupLongitude,
        loc.location.latitude,
        loc.location.longitude,
      );

      const driver = drivers.find((d) => d.userId.toString() === userIdStr);
      if (!driver) continue;

      result.push({
        userId: loc.userId,
        driverCode: driver.driverCode,
        isOnline: true,
        isAvailable: true,
        isTrackingOn: loc.isTrackingOn,
        speed: loc.speed,
        heading: loc.heading,
        location: {
          latitude: loc.location.latitude,
          longitude: loc.location.longitude,
        },
        distance: distance,
        driverRideTypeCode: driver.rideTypeCode || "",
        vehicleClassRideTypes: [],
        vehicle: {
          categoryCode: driver.vehicle.categoryCode,
          companyCode: driver.vehicle.companyCode,
          modelCode: driver.vehicle.modelCode,
          vehicleNumber: driver.vehicle.vehicleNumber,
          vehicleColor: driver.vehicle.vehicleColor,
          maxPassengers: driver.vehicle.maxPassengers,
          vehicleClass: driver.vehicle.vehicleClass || "Economy",
          baseFare: driver.vehicle.baseFare || 150,
          classFare: driver.vehicle.classFare || 30,
          vehicleType: driver.vehicle.vehicleType || "SUV",
          hasAC: driver.vehicle.hasAC || false,
          luggageCapacity: driver.vehicle.luggageCapacity || 0,
          handBagCapacity: driver.vehicle.handBagCapacity || 2,
          seatCapacity: driver.vehicle.seatCapacity || 7,
          passengerCapacity: driver.vehicle.passengerCapacity || 4,
          manufacturingYear: driver.vehicle.manufacturingYear,
        },
      });
    }

    result.sort((a, b) => a.distance - b.distance);
    return result.slice(0, this.MAX_DRIVERS_TO_FETCH);
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;
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
}