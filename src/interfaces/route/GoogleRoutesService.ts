// interfaces/route/GoogleRoutesService.ts

import axios from "axios";
import {
  IRouteService,
  IRouteParams,
  IRouteResult,
  IRouteStep,
  IRefreshRouteParams,
  IShouldRefreshParams,
} from "./IRouteService";

interface IGoogleRouteResponse {
  routes: Array<{
    distanceMeters: number;
    duration: string;
    durationInTraffic?: string;
    polyline: {
      encodedPolyline: string;
    };
    legs: Array<{
      startLocation: {
        latLng: {
          latitude: number;
          longitude: number;
        };
      };
      endLocation: {
        latLng: {
          latitude: number;
          longitude: number;
        };
      };
      steps: Array<{
        distanceMeters: number;
        duration: string;
        navigationInstruction: {
          instructions: string;
          maneuver?: string;
        };
        travelMode: string;
        polyline: {
          encodedPolyline: string;
        };
      }>;
    }>;
  }>;
}

interface IGoogleRoutesConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
}

export class GoogleRoutesService implements IRouteService {
  private readonly config: IGoogleRoutesConfig;
  private readonly routeCache: Map<
    string,
    { data: IRouteResult; timestamp: number }
  >;

  constructor() {
    this.config = {
      apiKey: process.env.GOOGLE_ROUTES_API_KEY || "",
      baseUrl:
        process.env.GOOGLE_ROUTES_API_URL || "https://routes.googleapis.com",
      timeoutMs: parseInt(process.env.GOOGLE_ROUTES_TIMEOUT_MS || "10000"),
      maxRetries: parseInt(process.env.GOOGLE_ROUTES_MAX_RETRIES || "3"),
    };

    if (!this.config.apiKey) {
      throw new Error("GOOGLE_ROUTES_API_KEY is required");
    }

    this.routeCache = new Map();
  }

  async getRoute(params: IRouteParams): Promise<IRouteResult> {
    const cacheKey = this.generateCacheKey(params);
    const cached = this.routeCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 300000) {
      console.log("✅ Route cache hit");
      return cached.data;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`📡 Attempt ${attempt} calling Google Routes API...`);
        const result = await this.callGoogleRoutesAPI(params);
        this.routeCache.set(cacheKey, { data: result, timestamp: Date.now() });
        console.log("✅ Google Routes API Success");
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`❌ Attempt ${attempt} failed:`, lastError.message);
        if (attempt < this.config.maxRetries) {
          console.log(`⏳ Retrying in ${1000 * attempt}ms...`);
          await this.delay(1000 * attempt);
        }
      }
    }

    throw new Error(`Google Routes API failed: ${lastError?.message}`);
  }

  // =========================================================
  // ✅ FIXED: Simplified request body - Matches working curl
  // =========================================================
  private async callGoogleRoutesAPI(
    params: IRouteParams,
  ): Promise<IRouteResult> {
    // ✅ SIMPLIFIED REQUEST BODY - Removed unnecessary fields
    const requestBody = {
      origin: {
        location: {
          latLng: {
            latitude: params.origin.latitude,
            longitude: params.origin.longitude,
          },
        },
      },
      destination: {
        location: {
          latLng: {
            latitude: params.destination.latitude,
            longitude: params.destination.longitude,
          },
        },
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    };

    // ✅ SIMPLE FIELDMASK - Exactly what worked in curl
    const fieldMask =
      "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline";

    console.log("📡 Google Routes API Request:");
    console.log(
      "📍 URL:",
      `${this.config.baseUrl}/directions/v2:computeRoutes`,
    );
    console.log("📍 Body:", JSON.stringify(requestBody, null, 2));
    console.log("📍 FieldMask:", fieldMask);

    try {
      const response = await axios.post<IGoogleRouteResponse>(
        `${this.config.baseUrl}/directions/v2:computeRoutes`,
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.config.apiKey,
            "X-Goog-FieldMask": fieldMask,
          },
          timeout: this.config.timeoutMs,
        },
      );

      console.log("✅ Google Routes API Success");
      return this.parseGoogleResponse(response.data);
    } catch (error: any) {
      console.error("❌ Google Routes API Error:");

      if (error.response) {
        console.error("📡 Status:", error.response.status);
        console.error(
          "📡 Response Data:",
          JSON.stringify(error.response.data, null, 2),
        );

        if (error.response.status === 400) {
          const errorMsg = error.response.data?.error?.message || "Bad Request";
          throw new Error(`Invalid request: ${errorMsg}`);
        }

        throw new Error(
          `Google Routes API Error: ${error.response.status} - ${error.response.data?.error?.message || "Unknown error"}`,
        );
      } else if (error.request) {
        console.error("📡 No response received");
        throw new Error("No response from Google Routes API");
      } else {
        console.error("📡 Request error:", error.message);
        throw new Error(`Request error: ${error.message}`);
      }
    }
  }

  private parseGoogleResponse(data: IGoogleRouteResponse): IRouteResult {
    if (!data.routes || data.routes.length === 0) {
      throw new Error("No routes found");
    }

    const route = data.routes[0];
    const leg = route.legs?.[0];

    const distanceMeters = route.distanceMeters || 0;
    const durationSeconds = this.parseDuration(route.duration);
    const trafficDurationSeconds = route.durationInTraffic
      ? this.parseDuration(route.durationInTraffic)
      : durationSeconds;

    const steps: IRouteStep[] =
      leg?.steps?.map((step) => ({
        distance: step.distanceMeters / 1000,
        duration: this.parseDuration(step.duration) / 60,
        instruction: step.navigationInstruction?.instructions || "",
        polyline: step.polyline?.encodedPolyline || "",
        travelMode: step.travelMode || "",
        maneuver: step.navigationInstruction?.maneuver || "",
      })) || [];

    return {
      roadDistanceKm: distanceMeters / 1000,
      normalDurationMinutes: durationSeconds / 60,
      trafficDurationMinutes: trafficDurationSeconds / 60,
      encodedPolyline: route.polyline?.encodedPolyline || "",
      routeSummary: {
        startAddress: leg?.startLocation?.latLng
          ? `${leg.startLocation.latLng.latitude},${leg.startLocation.latLng.longitude}`
          : "",
        endAddress: leg?.endLocation?.latLng
          ? `${leg.endLocation.latLng.latitude},${leg.endLocation.latLng.longitude}`
          : "",
        durationText: `${Math.round(trafficDurationSeconds / 60)} mins`,
        distanceText: `${(distanceMeters / 1000).toFixed(1)} km`,
        steps: steps,
      },
    };
  }

  private parseDuration(duration: string): number {
    if (!duration) return 0;
    const match = duration.match(/^(\d+)s$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  async refreshRoute(
    params: IRefreshRouteParams,
  ): Promise<IRouteResult | null> {
    const RideBooking = require("../../models/tizzyos/cab/rideBooking").default;
    const booking = await RideBooking.findOne({ bookingId: params.bookingId })
      .lean()
      .exec();

    if (!booking) {
      throw new Error(`Booking not found: ${params.bookingId}`);
    }

    const shouldRefresh = this.shouldRefreshRoute({
      distanceSinceLastRefreshKm: params.forceRefresh
        ? 999
        : this.calculateDistanceSinceRefresh(booking, params.currentLocation),
      timeSinceLastRefreshMinutes: params.forceRefresh
        ? 999
        : this.calculateTimeSinceRefresh(booking),
      isOffRoute:
        params.forceRefresh || this.isOffRoute(booking, params.currentLocation),
      isCustomerTracking: true,
      routeData: {
        roadDistanceKm: booking.roadDistanceKm || 0,
        normalDurationMinutes: booking.normalDurationMinutes || 0,
        trafficDurationMinutes: booking.trafficDurationMinutes || 0,
        encodedPolyline: booking.encodedPolyline || "",
        routeSummary: booking.routeSummary || {
          startAddress: "",
          endAddress: "",
          durationText: "",
          distanceText: "",
          steps: [],
        },
      },
      currentLocation: params.currentLocation,
    });

    if (!shouldRefresh) {
      return null;
    }

    return this.getRoute({
      origin: {
        latitude: params.currentLocation.latitude,
        longitude: params.currentLocation.longitude,
        address: "",
      },
      destination: {
        latitude: booking.destination.latitude,
        longitude: booking.destination.longitude,
        address: booking.destination.address,
      },
    });
  }

  shouldRefreshRoute(params: IShouldRefreshParams): boolean {
    const { distanceSinceLastRefreshKm, isOffRoute } = params;
    if (isOffRoute) return true;
    if (distanceSinceLastRefreshKm >= 2) return true;
    return false;
  }

  private calculateDistanceSinceRefresh(
    booking: any,
    currentLocation: { latitude: number; longitude: number },
  ): number {
    if (!booking.lastRouteRefreshLocation) return 999;
    return this.haversineDistance(
      booking.lastRouteRefreshLocation.latitude,
      booking.lastRouteRefreshLocation.longitude,
      currentLocation.latitude,
      currentLocation.longitude,
    );
  }

  private calculateTimeSinceRefresh(booking: any): number {
    if (!booking.lastRouteRefreshAt) return 999;
    return (
      (Date.now() - new Date(booking.lastRouteRefreshAt).getTime()) /
      (60 * 1000)
    );
  }

  private isOffRoute(
    booking: any,
    currentLocation: { latitude: number; longitude: number },
  ): boolean {
    if (!booking.encodedPolyline || !booking.lastRouteRefreshLocation)
      return false;
    const distance = this.haversineDistance(
      booking.lastRouteRefreshLocation.latitude,
      booking.lastRouteRefreshLocation.longitude,
      currentLocation.latitude,
      currentLocation.longitude,
    );
    return distance > 0.5;
  }

  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;
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

  private generateCacheKey(params: IRouteParams): string {
    return `${params.origin.latitude},${params.origin.longitude}|${params.destination.latitude},${params.destination.longitude}|${params.travelMode}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  clearCache(): void {
    this.routeCache.clear();
  }
}
