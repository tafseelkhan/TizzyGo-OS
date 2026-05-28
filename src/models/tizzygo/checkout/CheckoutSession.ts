// models/checkout/CheckoutSession.ts
import mongoose, { Schema, Document } from "mongoose";

export interface ICheckoutSession extends Document {
  checkoutSessionId: string;
  userId: string;
  orderId: string;
  cartSnapshot: {
    items: Array<{
      productId: string;
      quantity: number;
      selectedVariant?: Record<string, any>;
      productData: Record<string, any>;
    }>;
    calculatedData: {
      totalBeforeCoupon: number;
      discountApplied: number;
      deliveryCharge: number;
      productGst: number;
      productGstRate: number;
      platformFee: number;
      finalAmount: number;
      distanceKm: number;
      couponUsed?: string;
      couponData?: Record<string, any>;
      coFundApplied?: boolean;
      fundSplit?: { bank: number; merchant: number };
    };
  };
  address: {
    address: string;
    googlePlaceId?: string;
    latitude: number;
    longitude: number;
  };
  paymentMethod: "online" | "cod";
  paymentIntentId?: string;
  status: "pending" | "processing" | "completed" | "expired" | "failed";
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CheckoutSessionSchema: Schema<ICheckoutSession> = new Schema(
  {
    checkoutSessionId: {
      type: String,
      unique: true,
      required: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    orderId: {
      type: String,
      required: true,
    },
    cartSnapshot: {
      items: [{
        productId: String,
        quantity: Number,
        selectedVariant: Schema.Types.Mixed,
        productData: Schema.Types.Mixed,
      }],
      calculatedData: {
        totalBeforeCoupon: Number,
        discountApplied: Number,
        deliveryCharge: Number,
        productGst: Number,
        productGstRate: Number,
        platformFee: Number,
        finalAmount: Number,
        distanceKm: Number,
        couponUsed: String,
        couponData: Schema.Types.Mixed,
        coFundApplied: Boolean,
        fundSplit: {
          bank: Number,
          merchant: Number,
        },
      },
    },
    address: {
      address: {
        type: String,
        required: true,
      },
      googlePlaceId: String,
      latitude: Number,
      longitude: Number,
    },
    paymentMethod: {
      type: String,
      enum: ["online", "cod"],
      required: true,
    },
    paymentIntentId: {
      type: String,
      sparse: true, // Only for online payments
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "expired", "failed"],
      default: "pending",
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // TTL index for automatic cleanup
    },
  },
  {
    timestamps: true,
  }
);

// Add indexes for better query performance
CheckoutSessionSchema.index({ checkoutSessionId: 1 });
CheckoutSessionSchema.index({ userId: 1, status: 1 });
CheckoutSessionSchema.index({ paymentIntentId: 1 }, { sparse: true });

export default mongoose.models.CheckoutSession ||
  mongoose.model<ICheckoutSession>("CheckoutSession", CheckoutSessionSchema);