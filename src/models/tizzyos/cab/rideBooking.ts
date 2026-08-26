// models/tizzyos/cab/rideBooking.ts

import mongoose, { Document, Schema } from "mongoose";

export interface IFare {
  baseFare: number;
  classFare: number;
  distanceFare: number;
  timeFare: number;
  platformFees: number;
  subTotal: number;
  gstFare: number;
  totalFare: number;
  gstPercentage: number;
  perKmRate: number;
  perMinuteRate: number;
}

export interface IRouteSummary {
  startAddress: string;
  endAddress: string;
  durationText: string;
  distanceText: string;
  steps: Array<{
    distance: number;
    duration: number;
    instruction: string;
    polyline: string;
    travelMode: string;
    maneuver: string;
  }>;
}

export interface IRetryHistory {
  attemptNumber: number;
  oldFare: number;
  newFare: number;
  incrementPercentage: number;
  batchStartedFrom: number;
  timestamp: Date;
  radius: number;
  status: "started" | "completed" | "failed";
  driversFound?: number;
  completedAt?: Date;
}

export type RideServiceType = "LOCAL_RIDE" | "AIRPORT";

export interface IRideBooking extends Document {
  bookingId: string;
  rideCode: string;
  serviceType: RideServiceType;
  quoteId: string;
  fwsLocalRideId?: string;
  fwsAirportRideId?: string;
  trackingId?: string;
  customerId: mongoose.Types.ObjectId;
  driverId?: mongoose.Types.ObjectId;
  vehicle: {
    categoryCode: string;
    companyCode: string;
    modelCode: string;
    vehicleType: string;
    class: string;
    baseFare: number;
    classFare: number;
    maxPassengers: number;
  };
  pickup: {
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId: string;
  };
  destination: {
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId: string;
  };
  currentLocation?: {
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId: string;
  };
  lastLocationUpdate?: Date;
  distance: number;
  duration: number;
  roadDistanceKm: number;
  normalDurationMinutes: number;
  trafficDurationMinutes: number;
  encodedPolyline: string;
  routeSummary: IRouteSummary;
  fare: IFare;
  originalFare?: number;
  retryFare?: number;
  lastFareIncrementPercentage?: number;
  retryAttempts?: number;
  retryHistory: IRetryHistory[];
  driversFound?: number;
  searchStartedAt?: Date;

  // ✅ NEW: QR structure with separate pickup and drop QR
  qr?: {
    pickup?: {
      token?: string;
      qrUrl?: string;
      generatedAt?: Date;
      expiresAt?: Date;
      scannedAt?: Date;
      status?: "pending" | "scanned" | "expired";
    };
    drop?: {
      token?: string;
      qrUrl?: string;
      generatedAt?: Date;
      expiresAt?: Date;
      scannedAt?: Date;
      status?: "pending" | "scanned" | "expired";
    };
  };

  // ✅ NEW: Root level verification fields
  pickupVerified?: boolean;
  pickupVerifiedAt?: Date;
  dropVerified?: boolean;
  dropVerifiedAt?: Date;

  status:
    | "searching"
    | "accepted"
    | "arrived"
    | "pickupVerified"
    | "inTransit"
    | "dropVerified"
    | "paymentPending"
    | "completed"
    | "cancelled"
    | "no_driver_found";
  searchRadius: number;
  currentBatch: number;
  searchExpiredAt?: Date;
  searchCompleted: boolean;
  acceptedAt?: Date;
  arrivedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: "customer" | "driver" | "system";
  cancelReason?: string;
  paymentMethod: "COC" | "ONLINE";
  paymentStatus: "PENDING" | "COMPLETED" | "FAILED";
  paymentCompletedAt?: Date;
  refundedAt?: Date;
  lastRouteRefreshAt?: Date;
  lastRouteRefreshLocation?: {
    latitude: number;
    longitude: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const RideBookingSchema = new Schema<IRideBooking>(
  {
    bookingId: {
      type: String,
      required: true,
      unique: true,
    },
    rideCode: {
      type: String,
      required: true,
      unique: true,
    },
    serviceType: {
      type: String,
      enum: ["LOCAL_RIDE", "AIRPORT"],
      required: true,
      index: true,
    },
    quoteId: {
      type: String,
      required: true,
      index: true,
    },
    fwsLocalRideId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      index: true,
    },
    fwsAirportRideId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      index: true,
    },
    trackingId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    vehicle: {
      categoryCode: { type: String, required: true },
      companyCode: { type: String, required: true },
      modelCode: { type: String, required: true },
      vehicleType: { type: String, required: true },
      class: { type: String, required: true },
      baseFare: { type: Number, required: true },
      classFare: { type: Number, required: true },
      maxPassengers: { type: Number, required: true },
    },
    pickup: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      address: { type: String, required: true },
      googlePlaceId: { type: String, required: true },
    },
    destination: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      address: { type: String, required: true },
      googlePlaceId: { type: String, required: true },
    },
    currentLocation: {
      latitude: { type: Number, required: false },
      longitude: { type: Number, required: false },
      address: { type: String, required: false },
      googlePlaceId: { type: String, required: false },
    },
    lastLocationUpdate: { type: Date, required: false },
    distance: { type: Number, required: true },
    duration: { type: Number, required: true },
    roadDistanceKm: { type: Number, required: true },
    normalDurationMinutes: { type: Number, required: true },
    trafficDurationMinutes: { type: Number, required: true },
    encodedPolyline: { type: String, required: true },
    routeSummary: {
      startAddress: { type: String, required: true },
      endAddress: { type: String, required: true },
      durationText: { type: String, required: true },
      distanceText: { type: String, required: true },
      steps: {
        type: [
          {
            distance: { type: Number, required: true },
            duration: { type: Number, required: true },
            instruction: { type: String, required: true },
            polyline: { type: String, required: true },
            travelMode: { type: String, required: true },
            maneuver: { type: String, required: true },
          },
        ],
        required: true,
      },
    },
    fare: {
      baseFare: { type: Number, required: true },
      classFare: { type: Number, required: true },
      distanceFare: { type: Number, required: true },
      timeFare: { type: Number, required: true },
      platformFees: { type: Number, required: true },
      subTotal: { type: Number, required: true },
      gstFare: { type: Number, required: true },
      totalFare: { type: Number, required: true },
      gstPercentage: { type: Number, required: true },
      perKmRate: { type: Number, required: true },
      perMinuteRate: { type: Number, required: true },
    },
    originalFare: { type: Number, required: false },
    retryFare: { type: Number, required: false },
    lastFareIncrementPercentage: { type: Number, required: false },
    retryAttempts: { type: Number, default: 0 },
    retryHistory: {
      type: [
        {
          attemptNumber: { type: Number, required: true },
          oldFare: { type: Number, required: true },
          newFare: { type: Number, required: true },
          incrementPercentage: { type: Number, required: true },
          batchStartedFrom: { type: Number, required: true },
          timestamp: { type: Date, default: Date.now },
          radius: { type: Number, required: true },
          status: {
            type: String,
            enum: ["started", "completed", "failed"],
            default: "started",
          },
          driversFound: { type: Number, default: 0 },
          completedAt: { type: Date },
        },
      ],
      default: [],
    },
    driversFound: { type: Number, default: 0 },
    searchStartedAt: { type: Date, required: false },

    // ✅ NEW: QR structure with separate pickup and drop QR
    qr: {
      type: {
        pickup: {
          token: { type: String, required: false },
          qrUrl: { type: String, required: false },
          generatedAt: { type: Date, required: false },
          expiresAt: { type: Date, required: false },
          scannedAt: { type: Date, required: false },
          status: {
            type: String,
            enum: ["pending", "scanned", "expired"],
            required: false,
          },
        },
        drop: {
          token: { type: String, required: false },
          qrUrl: { type: String, required: false },
          generatedAt: { type: Date, required: false },
          expiresAt: { type: Date, required: false },
          scannedAt: { type: Date, required: false },
          status: {
            type: String,
            enum: ["pending", "scanned", "expired"],
            required: false,
          },
        },
      },
      required: false,
      default: undefined,
    },

    // ✅ NEW: Root level verification fields
    pickupVerified: {
      type: Boolean,
      default: false,
      required: false,
    },
    pickupVerifiedAt: {
      type: Date,
      required: false,
    },
    dropVerified: {
      type: Boolean,
      default: false,
      required: false,
    },
    dropVerifiedAt: {
      type: Date,
      required: false,
    },

    status: {
      type: String,
      enum: [
        "searching",
        "accepted",
        "arrived",
        "pickupVerified",
        "inTransit",
        "dropVerified",
        "paymentPending",
        "completed",
        "cancelled",
        "no_driver_found",
      ],
      default: "searching",
      required: true,
    },
    searchRadius: { type: Number, default: 5, required: true },
    currentBatch: { type: Number, default: 0, required: true },
    searchExpiredAt: { type: Date, required: false },
    searchCompleted: { type: Boolean, default: false, required: true },
    acceptedAt: { type: Date, required: false },
    arrivedAt: { type: Date, required: false },
    startedAt: { type: Date, required: false },
    completedAt: { type: Date, required: false },
    cancelledAt: { type: Date, required: false },
    cancelledBy: {
      type: String,
      enum: ["customer", "driver", "system"],
      required: false,
    },
    cancelReason: { type: String, required: false },
    paymentMethod: {
      type: String,
      enum: ["COC", "ONLINE"],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      default: "PENDING",
      required: true,
    },
    paymentCompletedAt: { type: Date, required: false },
    refundedAt: { type: Date, required: false },
    lastRouteRefreshAt: { type: Date, required: false },
    lastRouteRefreshLocation: {
      latitude: { type: Number, required: false },
      longitude: { type: Number, required: false },
    },
  },
  {
    timestamps: true,
  },
);

// ✅ UPDATED INDEXES
RideBookingSchema.index({ customerId: 1 });
RideBookingSchema.index({ driverId: 1 });
RideBookingSchema.index({ status: 1 });
RideBookingSchema.index({ searchRadius: 1 });
RideBookingSchema.index({ currentBatch: 1 });
RideBookingSchema.index({ searchCompleted: 1 });
RideBookingSchema.index({ pickupVerified: 1, dropVerified: 1 });
RideBookingSchema.index({ "fare.totalFare": 1 });
RideBookingSchema.index({ createdAt: -1 });

// ✅ NEW: QR token indexes
RideBookingSchema.index({ "qr.pickup.token": 1 });
RideBookingSchema.index({ "qr.drop.token": 1 });

// ✅ NEW: Individual verification indexes
RideBookingSchema.index({ pickupVerified: 1 });
RideBookingSchema.index({ dropVerified: 1 });

export default mongoose.model<IRideBooking>("RideBooking", RideBookingSchema);
