import mongoose, { Document, Schema } from "mongoose";

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

export interface IRideTracking extends Document {
  bookingId: string;
  trackingId: string;
  rideId: mongoose.Types.ObjectId;
  rideCode: string;
  customerId: mongoose.Types.ObjectId;
  driverId: mongoose.Types.ObjectId;
  location: {
    type: "Point";
    coordinates: [number, number];
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId: string;
  };
  heading?: number;
  speed?: number;
  accuracy?: number;
  bearing?: number;
  altitude?: number;
  provider?: string;
  batteryLevel?: number;
  networkType?: string;
  isMockLocation: boolean;
  distanceFromPickup: number;
  distanceToDestination: number;
  roadDistanceKm?: number;
  trafficDurationMinutes?: number;
  normalDurationMinutes?: number;
  encodedPolyline?: string;
  routeSummary?: IRouteSummary;
  estimatedArrivalTime?: Date;
  estimatedArrivalDuration?: number;
  remainingDistance?: number;
  remainingDuration?: number;
  tripDistanceCovered: number;
  tripDuration: number;
  rideStatus: string;
  pickupVerified: boolean;
  pickupVerifiedAt?: Date;
  dropVerified: boolean;
  dropVerifiedAt?: Date;
  lastLocationUpdate?: Date;
  pickupQRToken?: string;
  dropQRToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RideTrackingSchema = new Schema<IRideTracking>(
  {
    bookingId: {
      type: String,
      required: true,
    },
    trackingId: {
      type: String,
      required: true,
      unique: true,
    },
    rideId: {
      type: Schema.Types.ObjectId,
      ref: "RideBooking",
      required: true,
    },
    rideCode: {
      type: String,
      required: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
      latitude: {
        type: Number,
        required: true,
      },
      longitude: {
        type: Number,
        required: true,
      },
      address: {
        type: String,
        required: true,
      },
      googlePlaceId: {
        type: String,
        required: true,
      },
    },
    heading: {
      type: Number,
      required: false,
    },
    speed: {
      type: Number,
      required: false,
    },
    accuracy: {
      type: Number,
      required: false,
    },
    bearing: {
      type: Number,
      required: false,
    },
    altitude: {
      type: Number,
      required: false,
    },
    provider: {
      type: String,
      required: false,
    },
    batteryLevel: {
      type: Number,
      required: false,
    },
    networkType: {
      type: String,
      required: false,
    },
    isMockLocation: {
      type: Boolean,
      default: false,
      required: true,
    },
    distanceFromPickup: {
      type: Number,
      required: true,
    },
    distanceToDestination: {
      type: Number,
      required: true,
    },
    roadDistanceKm: { type: Number, required: false },
    trafficDurationMinutes: { type: Number, required: false },
    normalDurationMinutes: { type: Number, required: false },
    encodedPolyline: { type: String, required: false },
    routeSummary: {
      startAddress: { type: String, required: false },
      endAddress: { type: String, required: false },
      durationText: { type: String, required: false },
      distanceText: { type: String, required: false },
      steps: {
        type: [
          {
            distance: { type: Number, required: false },
            duration: { type: Number, required: false },
            instruction: { type: String, required: false },
            polyline: { type: String, required: false },
            travelMode: { type: String, required: false },
            maneuver: { type: String, required: false },
          },
        ],
        required: false,
      },
    },
    estimatedArrivalTime: { type: Date, required: false },
    estimatedArrivalDuration: { type: Number, required: false },
    remainingDistance: { type: Number, required: false },
    remainingDuration: { type: Number, required: false },
    tripDistanceCovered: {
      type: Number,
      default: 0,
      required: true,
    },
    tripDuration: {
      type: Number,
      default: 0,
      required: true,
    },
    rideStatus: {
      type: String,
      required: true,
    },
    pickupVerified: {
      type: Boolean,
      default: false,
      required: true,
    },
    pickupVerifiedAt: {
      type: Date,
      required: false,
    },
    dropVerified: {
      type: Boolean,
      default: false,
      required: true,
    },
    dropVerifiedAt: {
      type: Date,
      required: false,
    },
    lastLocationUpdate: {
      type: Date,
      required: false,
    },
    pickupQRToken: {
      type: String,
      required: false,
    },
    dropQRToken: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

RideTrackingSchema.index({ bookingId: 1 });
RideTrackingSchema.index({ rideId: 1 });
RideTrackingSchema.index({ driverId: 1 });
RideTrackingSchema.index({ rideCode: 1 });
RideTrackingSchema.index({ location: "2dsphere" });
RideTrackingSchema.index({ rideId: 1, createdAt: -1 });
RideTrackingSchema.index({ driverId: 1, createdAt: -1 });
RideTrackingSchema.index({ pickupVerified: 1, dropVerified: 1 });
RideTrackingSchema.index({ rideStatus: 1 });
RideTrackingSchema.index({ estimatedArrivalTime: 1 });

export default mongoose.model<IRideTracking>(
  "RideTracking",
  RideTrackingSchema,
);
