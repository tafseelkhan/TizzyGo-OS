import mongoose, { Document, Schema } from "mongoose";

export interface IRideDriverLocation extends Document {
  userId: mongoose.Types.ObjectId;
  isTrackingOn: boolean;
  location: {
    type: "Point";
    coordinates: [number, number];
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId: string;
  };
  driverCode: string;
  heading?: number;
  speed?: number;
  accuracy?: number;
  bearing?: number;
  altitude?: number;
  provider?: string;
  locationUpdatedAt?: Date;
  lastSocketUpdate?: Date;
  batteryLevel?: number;
  networkType?: string;
  isMockLocation: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RideDriverLocationSchema = new Schema<IRideDriverLocation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isTrackingOn: {
      type: Boolean,
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
    driverCode: {
      type: String,
      required: true,
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
    locationUpdatedAt: {
      type: Date,
      required: false,
    },
    lastSocketUpdate: {
      type: Date,
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
  },
  {
    timestamps: true,
  },
);

RideDriverLocationSchema.index({ userId: 1 }, { unique: true });
RideDriverLocationSchema.index({ location: "2dsphere" });
RideDriverLocationSchema.index({ driverCode: 1 });
RideDriverLocationSchema.index({ isTrackingOn: 1 });
RideDriverLocationSchema.index({ isMockLocation: 1 });
RideDriverLocationSchema.index({ locationUpdatedAt: -1 });

export default mongoose.model<IRideDriverLocation>(
  "RideDriverLocation",
  RideDriverLocationSchema,
);
