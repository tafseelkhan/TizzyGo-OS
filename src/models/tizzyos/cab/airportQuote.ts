import mongoose, { Document, Schema } from "mongoose";

// ✅ NEW: Airport info interface
export interface IAirportInfo {
  pickupIsAirport: boolean;
  dropIsAirport: boolean;
  airportName?: string;
  pickupAirportId?: mongoose.Types.ObjectId;
  dropAirportId?: mongoose.Types.ObjectId;
  pickupAirportName?: string;
  dropAirportName?: string;
}

export interface IAirportQuote extends Document {
  quoteId: string;
  serviceType: "AIRPORT";
  customerId: mongoose.Types.ObjectId;
  tripType: "AIRPORT_TO_LOCATION" | "LOCATION_TO_AIRPORT";
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
      distanceText: string;
      durationText: string;
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
  usedAt?: Date;
  // ✅ NEW: Airport info field
  airportInfo?: IAirportInfo;
  createdAt: Date;
  updatedAt: Date;
}

const AirportQuoteSchema = new Schema<IAirportQuote>(
  {
    quoteId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    serviceType: {
      type: String,
      enum: ["AIRPORT"],
      required: true,
      default: "AIRPORT",
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tripType: {
      type: String,
      enum: ["AIRPORT_TO_LOCATION", "LOCATION_TO_AIRPORT"],
      required: true,
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
        distanceText: { type: String, required: true },
        durationText: { type: String, required: true },
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
      index: true,
    },
    isUsed: {
      type: Boolean,
      default: false,
      index: true,
    },
    usedAt: {
      type: Date,
      required: false,
    },
    // ✅ NEW: Airport info field
    airportInfo: {
      pickupIsAirport: { type: Boolean, default: false },
      dropIsAirport: { type: Boolean, default: false },
      airportName: { type: String },
      pickupAirportId: { type: Schema.Types.ObjectId, ref: "Airport" },
      dropAirportId: { type: Schema.Types.ObjectId, ref: "Airport" },
      pickupAirportName: { type: String },
      dropAirportName: { type: String },
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
AirportQuoteSchema.index({ "pickup.latitude": 1, "pickup.longitude": 1 });
// ✅ NEW: Airport info indexes
AirportQuoteSchema.index({ "airportInfo.pickupIsAirport": 1 });
AirportQuoteSchema.index({ "airportInfo.dropIsAirport": 1 });
AirportQuoteSchema.index({ "airportInfo.airportName": 1 });

export default mongoose.model<IAirportQuote>("AirportQuote", AirportQuoteSchema);