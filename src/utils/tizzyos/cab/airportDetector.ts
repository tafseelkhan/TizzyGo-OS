import mongoose from "mongoose";
import Airport, { IAirport } from "../../../models/tizzyos/cab/airport";

/**
 * Coordinate validation result
 */
export interface IValidatedCoordinates {
  latitude: number;
  longitude: number;
  isValid: boolean;
  errors?: string[];
}

/**
 * Airport detection result
 */
export interface IAirportDetectionResult {
  isAirport: boolean;
  airport: IAirport | null;
  error?: string;
}

/**
 * Validates coordinates with proper type checking and range validation
 */
export function validateCoordinates(
  latitude: any,
  longitude: any,
  locationName: string = "Location"
): IValidatedCoordinates {
  const errors: string[] = [];

  // Check if values exist
  if (latitude === undefined || latitude === null) {
    errors.push(`${locationName} latitude is required`);
  }
  if (longitude === undefined || longitude === null) {
    errors.push(`${locationName} longitude is required`);
  }

  // Convert to numbers
  const lat = Number(latitude);
  const lng = Number(longitude);

  // Check for NaN
  if (isNaN(lat)) {
    errors.push(`Invalid ${locationName} latitude`);
  }
  if (isNaN(lng)) {
    errors.push(`Invalid ${locationName} longitude`);
  }

  // Check for finite numbers
  if (!Number.isFinite(lat) && !isNaN(lat)) {
    errors.push(`${locationName} latitude must be a finite number`);
  }
  if (!Number.isFinite(lng) && !isNaN(lng)) {
    errors.push(`${locationName} longitude must be a finite number`);
  }

  // Check range
  if (Number.isFinite(lat) && (lat < -90 || lat > 90)) {
    errors.push(`Latitude must be between -90 and 90`);
  }
  if (Number.isFinite(lng) && (lng < -180 || lng > 180)) {
    errors.push(`Longitude must be between -180 and 180`);
  }

  return {
    latitude: lat,
    longitude: lng,
    isValid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Find airport by coordinates using MongoDB $geoIntersects
 * 
 * IMPORTANT: GeoJSON uses [longitude, latitude] order
 * 
 * @param longitude - The longitude coordinate
 * @param latitude - The latitude coordinate
 * @returns The airport document or null if not found
 */
export async function findAirportByCoordinates(
  longitude: number,
  latitude: number
): Promise<IAirport | null> {
  // Validate coordinates before query
  const validation = validateCoordinates(latitude, longitude);
  if (!validation.isValid) {
    throw new Error(
      `Invalid coordinates: ${validation.errors?.join(", ")}`
    );
  }

  // Use $geoIntersects with GeoJSON Point
  // IMPORTANT: GeoJSON uses [longitude, latitude] order
  const airport = await Airport.findOne({
    boundary: {
      $geoIntersects: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
      },
    },
  }).lean();

  return airport;
}

/**
 * Check if coordinates are inside an airport
 */
export async function isInsideAirport(
  longitude: number,
  latitude: number
): Promise<boolean> {
  const airport = await findAirportByCoordinates(longitude, latitude);
  return !!airport;
}

/**
 * Detect airport for pickup and drop locations
 * Returns both results with proper error handling
 */
export async function detectAirportsForTrip(params: {
  pickupLatitude: number;
  pickupLongitude: number;
  dropLatitude: number;
  dropLongitude: number;
}): Promise<{
  pickupAirport: IAirport | null;
  dropAirport: IAirport | null;
  pickupIsAirport: boolean;
  dropIsAirport: boolean;
  errors?: string[];
}> {
  const errors: string[] = [];

  // Validate all coordinates first
  const pickupValidation = validateCoordinates(
    params.pickupLatitude,
    params.pickupLongitude,
    "Pickup"
  );
  const dropValidation = validateCoordinates(
    params.dropLatitude,
    params.dropLongitude,
    "Drop"
  );

  if (!pickupValidation.isValid) {
    errors.push(...(pickupValidation.errors || []));
  }
  if (!dropValidation.isValid) {
    errors.push(...(dropValidation.errors || []));
  }

  if (errors.length > 0) {
    return {
      pickupAirport: null,
      dropAirport: null,
      pickupIsAirport: false,
      dropIsAirport: false,
      errors,
    };
  }

  // Run both queries in parallel for performance
  const [pickupAirport, dropAirport] = await Promise.all([
    findAirportByCoordinates(
      pickupValidation.longitude,
      pickupValidation.latitude
    ),
    findAirportByCoordinates(
      dropValidation.longitude,
      dropValidation.latitude
    ),
  ]);

  return {
    pickupAirport,
    dropAirport,
    pickupIsAirport: !!pickupAirport,
    dropIsAirport: !!dropAirport,
  };
}

/**
 * Validate that at least one location is inside an airport
 * Throws error if both pickup and drop are outside airports
 */
export async function validateAirportRequirement(params: {
  pickupLatitude: number;
  pickupLongitude: number;
  dropLatitude: number;
  dropLongitude: number;
}): Promise<{
  pickupAirport: IAirport | null;
  dropAirport: IAirport | null;
  pickupIsAirport: boolean;
  dropIsAirport: boolean;
}> {
  const result = await detectAirportsForTrip(params);

  if (result.errors && result.errors.length > 0) {
    throw new Error(`Validation failed: ${result.errors.join(", ")}`);
  }

  // Business rule: At least one location must be inside an airport
  if (!result.pickupIsAirport && !result.dropIsAirport) {
    throw new Error(
      "At least pickup or drop location must be inside an airport"
    );
  }

  return {
    pickupAirport: result.pickupAirport,
    dropAirport: result.dropAirport,
    pickupIsAirport: result.pickupIsAirport,
    dropIsAirport: result.dropIsAirport,
  };
}