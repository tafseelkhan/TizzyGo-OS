import mongoose, { Schema, Document, Types } from "mongoose";

export interface ISearchLog extends Document {
  userId?: Types.ObjectId;

  query: string;
  normalizedQuery: string;

  resultsCount: number;

  source: "search" | "voice" | "barcode";

  device?: "android" | "ios" | "web";

  clickedProductId?: Types.ObjectId;
  clickedSellerId?: Types.ObjectId;

  ipAddress?: string;
  userAgent?: string;

  createdAt: Date;
  updatedAt: Date;
}

const SearchLogSchema = new Schema<ISearchLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    query: {
      type: String,
      required: true,
      trim: true,
    },

    normalizedQuery: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },

    resultsCount: {
      type: Number,
      default: 0,
    },

    source: {
      type: String,
      enum: ["search", "voice", "barcode"],
      default: "search",
    },

    device: {
      type: String,
      enum: ["android", "ios", "web"],
    },

    clickedProductId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
    },

    clickedSellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    ipAddress: String,

    userAgent: String,
  },
  {
    timestamps: true,
  },
);

// Fast search history
SearchLogSchema.index({ createdAt: -1 });

export default mongoose.model<ISearchLog>("SearchLog", SearchLogSchema);
