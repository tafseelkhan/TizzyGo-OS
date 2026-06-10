import mongoose, { Schema, Document } from "mongoose";

export interface BuyerLocationDocument extends Document {
  userId: mongoose.Types.ObjectId;
  label?: string;

  location: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]

    address: string;
    city: string;
    state: string;
    country: string;
    pinCode: string;
    landmark?: string;
  };

  gpsTrackingEnabled: boolean;
  isDefault?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BuyerLocationSchema = new Schema<BuyerLocationDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    label: {
      type: String,
      default: "Home",
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
        default: "Point",
      },

      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
      },

      address: {
        type: String,
        required: true,
      },

      city: {
        type: String,
        required: true,
      },

      state: {
        type: String,
        required: true,
      },

      country: {
        type: String,
        required: true,
      },

      pinCode: {
        type: String,
        required: true,
      },

      landmark: {
        type: String,
      },
    },

    gpsTrackingEnabled: {
      type: Boolean,
      default: true, // By default GPS tracking ON
    },

    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: "buyer_locations",
  },
);

// Geo Index
BuyerLocationSchema.index({
  location: "2dsphere",
});

export default mongoose.model<BuyerLocationDocument>(
  "BuyerLocation",
  BuyerLocationSchema,
);
