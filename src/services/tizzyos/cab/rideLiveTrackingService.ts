import { Types } from "mongoose";
import RideBooking from "../../../models/tizzyos/cab/rideBooking";
import RideDriverLocation from "../../../models/tizzyos/cab/rideDriverLocation";
import BuyerLocation from "../../../models/tizzygo/locations/locations";

// ============================================================
// TYPES
// ============================================================

export interface TrackingDriverLocation {
  latitude: number;
  longitude: number;
}

export interface TrackingDriver {
  userId: string;
  driverCode?: string;
  location: TrackingDriverLocation | null;
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
  isTrackingOn: boolean;
  cachedLocation?: {
    latitude: number;
    longitude: number;
    heading: number;
    speed: number;
    timestamp: string;
  } | null;
}

export interface TrackingCustomerLocation {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  pinCode?: string;
  landmark?: string;
}

export interface TrackingCustomer {
  userId: string;
  location: TrackingCustomerLocation | null;
}

export interface RideLiveTrackingData {
  bookingId: string;
  trackingId?: string;
  rideCode: string;
  status: string;
  pickup: {
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId?: string;
  };
  destination: {
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId?: string;
  };
  driver: TrackingDriver;
  customer: TrackingCustomer;
}

export interface RideLiveTrackingResponse {
  bookingId: string;
  trackingId?: string;
  rideCode: string;
  status: string;
  pickup: {
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId?: string;
  };
  destination: {
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId?: string;
  };
  driver: TrackingDriver;
  customer: TrackingCustomer;
}

export interface GetRideTrackingOptions {
  bookingId: string;
  trackingId: string;
  userId: string;
  includeCachedLocation?: boolean;
  cachedLocation?: {
    latitude: number;
    longitude: number;
    heading: number;
    speed: number;
    timestamp: string;
  } | null;
}

// ============================================================
// VALID STATUSES FOR TRACKING
// ============================================================

const TRACKABLE_STATUSES = [
  "accepted",
  "arrived",
  "pickupVerified",
  "inTransit",
  "dropVerified",
  "paymentPending"
];

const COMPLETED_STATUSES = ["completed", "cancelled", "no_driver_found"];

// ============================================================
// MAIN SERVICE FUNCTION
// ============================================================

export const getRideLiveTracking = async (
  options: GetRideTrackingOptions
): Promise<RideLiveTrackingResponse> => {
  const {
    bookingId,
    trackingId,
    userId,
    includeCachedLocation = false,
    cachedLocation = null,
  } = options;

  // ============================================================
  // 1. VALIDATE: Booking ID & Tracking ID
  // ============================================================
  if (!bookingId || bookingId.trim() === "") {
    throw new Error("BOOKING_ID_REQUIRED");
  }

  if (!trackingId || trackingId.trim() === "") {
    throw new Error("TRACKING_ID_REQUIRED");
  }

  if (!bookingId) {
    throw new Error("BOOKING_NOT_FOUND");
  }

  // ============================================================
  // 2. FETCH: Find RideBooking with BOTH IDs
  // ============================================================
  const booking = await RideBooking.findOne({
    bookingId: bookingId,
    trackingId: trackingId,
  }).lean();

  if (!booking) {
    throw new Error("BOOKING_NOT_FOUND");
  }

  // ============================================================
  // 3. VALIDATE: User authorization (Customer OR Driver)
  // ============================================================
  const isCustomer = booking.customerId?.toString() === userId;
  const isDriver = booking.driverId?.toString() === userId;

  if (!isCustomer && !isDriver) {
    throw new Error("UNAUTHORIZED");
  }

  // ============================================================
  // 4. VALIDATE: Driver assigned
  // ============================================================
  if (!booking.driverId) {
    throw new Error("NO_DRIVER_ASSIGNED");
  }

  // ============================================================
  // 5. VALIDATE: Ride status
  // ============================================================
  const status = booking.status;

  if (!TRACKABLE_STATUSES.includes(status)) {
    if (COMPLETED_STATUSES.includes(status)) {
      throw new Error("RIDE_ALREADY_COMPLETED");
    }
    throw new Error("RIDE_NOT_TRACKABLE");
  }

  // ============================================================
  // 6. FETCH: Driver location from RideDriverLocation
  // ============================================================
  const driverLocationDoc = await RideDriverLocation.findOne({
    userId: booking.driverId,
  }).lean();

  let driverLocation: TrackingDriverLocation | null = null;
  let driverIsTrackingOn = false;
  let driverHeading: number | undefined;
  let driverSpeed: number | undefined;
  let driverAccuracy: number | undefined;
  let driverBearing: number | undefined;
  let driverAltitude: number | undefined;
  let driverProvider: string | undefined;
  let driverBatteryLevel: number | undefined;
  let driverNetworkType: string | undefined;
  let driverIsMockLocation: boolean | undefined;
  let driverLocationUpdatedAt: Date | undefined;

  if (driverLocationDoc) {
    // location.coordinates format: [longitude, latitude]
    const loc = driverLocationDoc.location;
    if (loc && loc.coordinates && loc.coordinates.length === 2) {
      driverLocation = {
        longitude: loc.coordinates[0],
        latitude: loc.coordinates[1],
      };
    }
    driverIsTrackingOn = driverLocationDoc.isTrackingOn || false;
    driverHeading = driverLocationDoc.heading;
    driverSpeed = driverLocationDoc.speed;
    driverAccuracy = driverLocationDoc.accuracy;
    driverBearing = driverLocationDoc.bearing;
    driverAltitude = driverLocationDoc.altitude;
    driverProvider = driverLocationDoc.provider;
    driverBatteryLevel = driverLocationDoc.batteryLevel;
    driverNetworkType = driverLocationDoc.networkType;
    driverIsMockLocation = driverLocationDoc.isMockLocation || false;
    driverLocationUpdatedAt =
      driverLocationDoc.locationUpdatedAt || driverLocationDoc.updatedAt;
  }

  // Build driver object
  const driver: TrackingDriver = {
    userId: booking.driverId.toString(),
    driverCode: (booking as any).driverCode || undefined,
    location: driverLocation,
    heading: driverHeading,
    speed: driverSpeed,
    accuracy: driverAccuracy,
    bearing: driverBearing,
    altitude: driverAltitude,
    provider: driverProvider,
    batteryLevel: driverBatteryLevel,
    networkType: driverNetworkType,
    isMockLocation: driverIsMockLocation,
    locationUpdatedAt: driverLocationUpdatedAt,
    isTrackingOn: driverIsTrackingOn,
  };

  // Add cached location if requested (for socket)
  if (includeCachedLocation && cachedLocation) {
    driver.cachedLocation = cachedLocation;
  }

  // ============================================================
  // 7. FETCH: Customer location from BuyerLocation
  // ============================================================
  let customerLocation: TrackingCustomerLocation | null = null;

  const customerLocationDoc = await BuyerLocation.findOne({
    userId: booking.customerId,
  })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();

  if (customerLocationDoc) {
    const loc = customerLocationDoc.location;
    // location.coordinates format: [longitude, latitude]
    if (loc && loc.coordinates && loc.coordinates.length === 2) {
      customerLocation = {
        longitude: loc.coordinates[0],
        latitude: loc.coordinates[1],
        address: loc.address,
        city: loc.city,
        state: loc.state,
        country: loc.country,
        pinCode: loc.pinCode,
        landmark: loc.landmark,
      };
    }
  }

  const customer: TrackingCustomer = {
    userId: booking.customerId.toString(),
    location: customerLocation,
  };

  // ============================================================
  // 8. BUILD: Final response
  // ============================================================
  const response: RideLiveTrackingResponse = {
    bookingId: booking.bookingId,
    trackingId: booking.trackingId,
    rideCode: booking.rideCode,
    status: booking.status,

    pickup: {
      latitude: booking.pickup?.latitude || 0,
      longitude: booking.pickup?.longitude || 0,
      address: booking.pickup?.address || "",
      googlePlaceId: booking.pickup?.googlePlaceId,
    },

    destination: {
      latitude: booking.destination?.latitude || 0,
      longitude: booking.destination?.longitude || 0,
      address: booking.destination?.address || "",
      googlePlaceId: booking.destination?.googlePlaceId,
    },

    driver,
    customer,
  };

  return response;
};