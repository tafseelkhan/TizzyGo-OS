// services/tizzyos/cab/rideQuoteService.ts

import mongoose from "mongoose";
import { GoogleRoutesService } from "../../../interfaces/route/GoogleRoutesService";
import { FareCalculationService } from "../../../interfaces/route/fare/FareCalculationService";
import RideVehicleCategory from "../../../models/tizzyos/cab/rideVehicleCatigory";
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
  class: string;
  baseFare: number;
  classFare: number;
  maxPassengers: number;
  estimatedFare: number;
  distance: number;
  duration: number;
  polyline: string;
  eta: number;
  estimatedDriverArrival: number;
  candidateId: string;
}

export class RideQuoteService {
  private readonly routeService: GoogleRoutesService;
  private readonly fareService: FareCalculationService;
  private readonly candidateCache: Map<
    string,
    { driverId: string; expiresAt: Date }
  >;

  constructor() {
    this.routeService = new GoogleRoutesService();
    this.fareService = new FareCalculationService();
    this.candidateCache = new Map();
  }

  // =====================================================
  // getRideOptions
  //
  // Purpose:
  // Returns all available vehicle options for the selected
  // pickup and drop location. Calls Google Routes API ONCE
  // and calculates fare for every vehicle type.
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
              class: model.class,
              baseFare: model.baseFare,
              classFare: model.classFare,
              maxPassengers: model.maxPassengers,
            },
            roadDistanceKm: route.roadDistanceKm,
            trafficDurationMinutes: route.trafficDurationMinutes,
          });

          // Generate temporary candidate ID (not real driver)
          const candidateId = this.generateCandidateId();

          options.push({
            vehicleType: model.vehicleType,
            categoryCode: category.code,
            companyCode: company.code,
            modelCode: model.code,
            class: model.class,
            baseFare: model.baseFare,
            classFare: model.classFare,
            maxPassengers: model.maxPassengers,
            estimatedFare: Math.round(fareComponents.totalFare),
            distance: route.roadDistanceKm,
            duration: route.trafficDurationMinutes,
            polyline: route.encodedPolyline,
            eta: route.trafficDurationMinutes, // ETA in minutes
            estimatedDriverArrival: 5, // Placeholder, will be calculated during dispatch
            candidateId: candidateId,
          });
        }
      }
    }

    // Sort by fare ascending
    options.sort((a, b) => a.estimatedFare - b.estimatedFare);

    return options;
  }

  // =====================================================
  // getCachedRoute
  //
  // Purpose:
  // Returns cached route data for a quote to avoid
  // calling Google Routes API multiple times.
  //
  // Called By:
  // Internally by getRideOptions
  // =====================================================

  async getCachedRoute(pickup: any, drop: any): Promise<any> {
    const cacheKey = this.generateRouteCacheKey(pickup, drop);
    // Implementation would use Redis or in-memory cache
    return null;
  }

  // =====================================================
  // generateCandidateId
  //
  // Purpose:
  // Generates a temporary UUID for a vehicle option.
  // This is NOT a real driver ID.
  //
  // Called By:
  // Internally by getRideOptions
  // =====================================================

  private generateCandidateId(): string {
    return uuidv4();
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
  // generateRouteCacheKey
  //
  // Purpose:
  // Generates a cache key for route data.
  //
  // Called By:
  // Internally by getCachedRoute
  // =====================================================

  private generateRouteCacheKey(pickup: any, drop: any): string {
    return `${pickup.latitude},${pickup.longitude}|${drop.latitude},${drop.longitude}`;
  }

  // =====================================================
  // storeCandidateMapping
  //
  // Purpose:
  // Stores mapping from candidateId to real driverId
  // after booking is created.
  //
  // Called By:
  // RideBookingService during booking creation
  // =====================================================

  storeCandidateMapping(candidateId: string, driverId: string): void {
    this.candidateCache.set(candidateId, {
      driverId,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    });
  }

  // =====================================================
  // getCandidateMapping
  //
  // Purpose:
  // Retrieves driverId from candidateId.
  //
  // Called By:
  // Internally during booking creation
  // =====================================================

  getCandidateMapping(candidateId: string): string | null {
    const mapping = this.candidateCache.get(candidateId);
    if (!mapping) return null;
    if (mapping.expiresAt < new Date()) {
      this.candidateCache.delete(candidateId);
      return null;
    }
    return mapping.driverId;
  }

  // =====================================================
  // clearExpiredCandidates
  //
  // Purpose:
  // Clears expired candidate mappings.
  //
  // Called By:
  // Background cleanup job
  // =====================================================

  clearExpiredCandidates(): void {
    const now = new Date();
    for (const [key, value] of this.candidateCache) {
      if (value.expiresAt < now) {
        this.candidateCache.delete(key);
      }
    }
  }
}
