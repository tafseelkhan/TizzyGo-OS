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
    serviceFare: number;
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
      googlePlaceId: { type: String, required: true },
    },
    drop: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      address: { type: String, required: true },
      googlePlaceId: { type: String, required: true },
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
    routeData: {
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
    },
    fareComponents: {
      baseFare: { type: Number, required: true },
      classFare: { type: Number, required: true },
      distanceFare: { type: Number, required: true },
      timeFare: { type: Number, required: true },
      platformFees: { type: Number, required: true },
      serviceFare: { type: Number, required: true },
      subTotal: { type: Number, required: true },
      gstFare: { type: Number, required: true },
      totalFare: { type: Number, required: true },
      gstPercentage: { type: Number, required: true },
      perKmRate: { type: Number, required: true },
      perMinuteRate: { type: Number, required: true },
    },
    totalFare: {
      type: Number,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0,
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

RideQuoteSchema.index({ quoteId: 1 });
RideQuoteSchema.index({ expiresAt: 1 });
RideQuoteSchema.index({ isUsed: 1 });

export default mongoose.model<IRideQuote>("RideQuote", RideQuoteSchema);
