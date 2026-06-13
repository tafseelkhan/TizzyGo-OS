import mongoose, { Schema, Document } from "mongoose";

export interface IShippingLocation extends Document {
  userId: mongoose.Types.ObjectId;
  shippingId?: string; // top-level riderId

  isTrackingOn: boolean; // location ON / OFF

  shippingType: "RIDER" | "TRUCK";

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

const ShippingLocationSchema = new Schema<IShippingLocation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    shippingId: {
      type: String,
      required: true,
      index: true,
    },

    isTrackingOn: {
      type: Boolean,
      default: false, // start / stop action se control hoga
    },

    shippingType: {
      type: String,
      enum: ["RIDER", "TRUCK"],
      required: true,
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
  { timestamps: true },
);

/* 🔥 INDEXES */
ShippingLocationSchema.index({ shippingId: 1 });
ShippingLocationSchema.index({ userId: 1 });
ShippingLocationSchema.index({
  "location.latitude": 1,
  "location.longitude": 1,
});

export default mongoose.model<IShippingLocation>(
  "ShippingLocation",
  ShippingLocationSchema,
  "fwsshippinglocations",
);
