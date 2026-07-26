// services/tizzyos/cab/rideQuoteService.ts

import mongoose from "mongoose";
import { GoogleRoutesService } from "../../../interfaces/route/GoogleRoutesService";
import { FareCalculationService } from "../../../interfaces/route/fare/FareCalculationService";
import RideVehicleCategory from "../../../models/tizzyos/cab/rideVehicleCatigory";
import RideQuote from "../../../models/tizzyos/cab/rideQuote";
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

interface IVehicleOption {
  vehicleType: string;
  categoryCode: string;
  companyCode: string;
  modelCode: string;
  vehicleClass: string;
  baseFare: number;
  classFare: number;
  maxPassengers: number;
  estimatedFare: number;
  distance: number;
  duration: number;
  polyline: string;
  eta: number;
  estimatedDriverArrival: number;
  quoteId: string; // Now returns quoteId instead of candidateId
}

export class RideQuoteService {
  private readonly routeService: GoogleRoutesService;
  private readonly fareService: FareCalculationService;

  constructor() {
    this.routeService = new GoogleRoutesService();
    this.fareService = new FareCalculationService();
  }

  // =====================================================
  // getRideOptions
  //
  // Purpose:
  // Returns all available vehicle options for the selected
  // pickup and drop location. Calls Google Routes API ONCE
  // and calculates fare for every vehicle type.
  // Stores quote in database for later booking.
  //
  // Called By:
  // Customer Frontend (POST /api/ride/options)
  //
  // Creates Booking?
  // NO
  //
  // Uses Google Routes API?
  // YES
  //
  // Uses Fare Calculation?
  // YES
  //
  // Starts Driver Dispatch?
  // NO
  // =====================================================

  async getRideOptions(quoteRequest: IQuoteRequest): Promise<IVehicleOption[]> {
    // Validate input
    this.validateLocation(quoteRequest.pickup);
    this.validateLocation(quoteRequest.drop);

    // Get route from Google Routes API (ONCE)
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

    // Get all vehicle categories
    const categories = await RideVehicleCategory.find().lean().exec();

    if (!categories || categories.length === 0) {
      throw new Error("No vehicle categories found");
    }

    const options: IVehicleOption[] = [];

    // Calculate fare for each vehicle type
    for (const category of categories) {
      for (const company of category.companies) {
        for (const model of company.models) {
          const fareComponents = this.fareService.calculateFare({
            vehicle: {
              categoryCode: category.code,
              companyCode: company.code,
              modelCode: model.code,
              vehicleType: model.vehicleType,
              vehicleClass: model.vehicleClass,
              baseFare: model.baseFare,
              classFare: model.classFare,
              maxPassengers: model.maxPassengers,
            },
            roadDistanceKm: route.roadDistanceKm,
            trafficDurationMinutes: route.trafficDurationMinutes,
          });

          // Generate quoteId (UUID)
          const quoteId = uuidv4();

          // Store quote in database
          const quote = new RideQuote({
            quoteId: quoteId,
            pickup: quoteRequest.pickup,
            drop: quoteRequest.drop,
            vehicle: {
              categoryCode: category.code,
              companyCode: company.code,
              modelCode: model.code,
              vehicleType: model.vehicleType,
              vehicleClass: model.vehicleClass,
              baseFare: model.baseFare,
              classFare: model.classFare,
              maxPassengers: model.maxPassengers,
            },
            routeData: {
              roadDistanceKm: route.roadDistanceKm,
              normalDurationMinutes: route.normalDurationMinutes,
              trafficDurationMinutes: route.trafficDurationMinutes,
              encodedPolyline: route.encodedPolyline,
              routeSummary: route.routeSummary,
            },
            fareComponents: {
              baseFare: fareComponents.baseFare,
              classFare: fareComponents.classFare,
              distanceFare: fareComponents.distanceFare,
              timeFare: fareComponents.timeFare,
              platformFees: fareComponents.platformFees,
              subTotal: fareComponents.subTotal,
              gstFare: fareComponents.gstFare,
              totalFare: Math.round(fareComponents.totalFare),
              gstPercentage: fareComponents.gstPercentage,
              perKmRate: fareComponents.perKmRate,
              perMinuteRate: fareComponents.perMinuteRate,
            },
            totalFare: Math.round(fareComponents.totalFare),
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
            isUsed: false,
          });

          await quote.save();

          options.push({
            vehicleType: model.vehicleType,
            categoryCode: category.code,
            companyCode: company.code,
            modelCode: model.code,
            vehicleClass: model.vehicleClass,
            baseFare: model.baseFare,
            classFare: model.classFare,
            maxPassengers: model.maxPassengers,
            estimatedFare: Math.round(fareComponents.totalFare),
            distance: route.roadDistanceKm,
            duration: route.trafficDurationMinutes,
            polyline: route.encodedPolyline,
            eta: route.trafficDurationMinutes,
            estimatedDriverArrival: 5,
            quoteId: quoteId, // Return quoteId instead of candidateId
          });
        }
      }
    }

    // Sort by fare ascending
    options.sort((a, b) => a.estimatedFare - b.estimatedFare);

    return options;
  }

  // =====================================================
  // validateLocation
  //
  // Purpose:
  // Validates location coordinates.
  //
  // Called By:
  // Internally by getRideOptions
  // =====================================================

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

  // =====================================================
  // cleanupExpiredQuotes
  //
  // Purpose:
  // Deletes expired quotes from database.
  //
  // Called By:
  // Background cleanup job
  // =====================================================

  async cleanupExpiredQuotes(): Promise<number> {
    const result = await RideQuote.deleteMany({
      expiresAt: { $lt: new Date() },
    });
    return result.deletedCount || 0;
  }
}
