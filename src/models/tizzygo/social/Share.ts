import mongoose, { Schema, Document, Types } from "mongoose";

export interface IShare extends Document {
  productId: Types.ObjectId;
  publicId?: string; // optional, for public URL
  productType: string;
  userId: Types.ObjectId;
  openCount: number; // ✅ add this
  platformStats: { ios: number; android: number; web: number }; // ✅ add this
  platform: string; // "whatsapp", "facebook", etc.
  createdAt: Date;
}

const ShareSchema = new Schema<IShare>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    publicId: { type: String, required: false },
    productType: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    platform: { type: String, required: true },
    openCount: { type: Number, default: 0 }, // ✅ default 0
    platformStats: { type: Object, default: { ios: 0, android: 0, web: 0 } }, // ✅ default stats
  },
  { timestamps: true }
);

// Indexes for quick stats + uniqueness
ShareSchema.index({ productId: 1, platform: 1 });
ShareSchema.index({ userId: 1, productId: 1, platform: 1 }, { unique: true });

export default mongoose.model<IShare>("Share", ShareSchema);
