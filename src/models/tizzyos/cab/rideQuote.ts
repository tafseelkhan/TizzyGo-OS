// models/tizzyos/cab/rideQuote.ts

import mongoose, { Document, Schema } from "mongoose";

export interface IRideQuote extends Document {
  quoteId: string;
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
  routeData: {
    roadDistanceKm: number;
    normalDurationMinutes: number;
    trafficDurationMinutes: number;
    encodedPolyline: string;
    routeSummary: {
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
    };
  };
  fareComponents: {
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
  };
  totalFare: number;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RideQuoteSchema = new Schema<IRideQuote>(
  {
    quoteId: {
      type: String,
      required: true,
      unique: true,
    },
    pickup: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      address: { type: String, required: true },
      googlePlaceId: { type: String, required: true, default: "N/A" },
    },
    drop: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      address: { type: String, required: true },
      googlePlaceId: { type: String, required: true, default: "N/A" },
    },
    vehicle: {
      categoryCode: { type: String, required: true, default: "TWOWHEELER" },
      companyCode: { type: String, required: true, default: "HERO" },
      modelCode: { type: String, required: true, default: "SPLENDORPLUS" },
      vehicleType: { type: String, required: true, default: "Bike" },
      class: { type: String, required: true, default: "Economy" },
      baseFare: { type: Number, required: true, default: 50 },
      classFare: { type: Number, required: true, default: 20 },
      maxPassengers: { type: Number, required: true, default: 1 },
    },
    routeData: {
      roadDistanceKm: { type: Number, required: true, default: 0 },
      normalDurationMinutes: { type: Number, required: true, default: 0 },
      trafficDurationMinutes: { type: Number, required: true, default: 0 },
      encodedPolyline: { type: String, required: true, default: "" },
      routeSummary: {
        startAddress: { type: String, required: true, default: "" },
        endAddress: { type: String, required: true, default: "" },
        durationText: { type: String, required: true, default: "0 min" },
        distanceText: { type: String, required: true, default: "0 km" },
        steps: {
          type: [
            {
              distance: { type: Number, required: true, default: 0 },
              duration: { type: Number, required: true, default: 0 },
              instruction: { type: String, required: true, default: "" },
              polyline: { type: String, required: true, default: "" },
              travelMode: { type: String, required: true, default: "DRIVE" },
              maneuver: { type: String, required: true, default: "" },
            },
          ],
          required: true,
          default: [],
        },
      },
    },
    fareComponents: {
      baseFare: { type: Number, required: true, default: 0 },
      classFare: { type: Number, required: true, default: 0 },
      distanceFare: { type: Number, required: true, default: 0 },
      timeFare: { type: Number, required: true, default: 0 },
      platformFees: { type: Number, required: true, default: 0 },
      subTotal: { type: Number, required: true, default: 0 },
      gstFare: { type: Number, required: true, default: 0 },
      totalFare: { type: Number, required: true, default: 0 },
      gstPercentage: { type: Number, required: true, default: 18 },
      perKmRate: { type: Number, required: true, default: 5 },
      perMinuteRate: { type: Number, required: true, default: 0.6 },
    },
    totalFare: {
      type: Number,
      required: true,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0,
      default: () => new Date(Date.now() + 5 * 60 * 1000),
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

RideQuoteSchema.index({ isUsed: 1 });

export default mongoose.model<IRideQuote>("RideQuote", RideQuoteSchema);
