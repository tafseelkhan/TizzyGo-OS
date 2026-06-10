import mongoose, { Schema, Document } from "mongoose";

export interface IShipperRiderLocation extends Document {
  riderId?: string; // top-level riderId

  isTrackingOn: boolean; // location ON / OFF

  location?: {
    latitude: number;
    longitude: number;
    address?: string;
    googlePlaceId?: string;
    updatedAt: Date;
  };

  createdAt: Date;
  updatedAt: Date;
}

const ShipperRiderLocationSchema = new Schema<IShipperRiderLocation>(
  {
    riderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    isTrackingOn: {
      type: Boolean,
      default: false, // start / stop action se control hoga
    },

    location: {
      latitude: Number,
      longitude: Number,
      address: String,
      googlePlaceId: String,
      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },
  },
  { timestamps: true }
);

/* 🔥 INDEXES */
ShipperRiderLocationSchema.index({ riderId: 1 });
ShipperRiderLocationSchema.index({
  "location.latitude": 1,
  "location.longitude": 1,
});

export default mongoose.model<IShipperRiderLocation>(
  "ShipperRiderLocation",
  ShipperRiderLocationSchema,
  "shipper_rider_locations"
);
