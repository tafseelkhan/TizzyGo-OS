import mongoose, { Schema, Document } from "mongoose";

// ✅ Buyer Location Interface
export interface BuyerLocationDocument extends Document {
  userId: mongoose.Types.ObjectId; // Buyer ka reference
  label?: string; // Home / Office / Other
  location: {
    address: string;
    city: string;
    state: string;
    country: string;
    pinCode: string;
    landmark?: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  isDefault?: boolean; // agar buyer ka default address hai
  createdAt: Date;
  updatedAt: Date;
}

// ✅ Buyer Location Schema
const BuyerLocationSchema: Schema = new Schema<BuyerLocationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    label: { type: String, default: "Home" },
    location: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, required: true },
      pinCode: { type: String, required: true },
      landmark: { type: String },
      coordinates: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
      },
    },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "buyer_locations" }
);

// ✅ Create 2dsphere index for geo queries
BuyerLocationSchema.index({ location: "2dsphere" });

export default mongoose.model<BuyerLocationDocument>(
  "BuyerLocation",
  BuyerLocationSchema
);
