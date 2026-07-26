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
  paymentGateway?: string; // NEW: Store which gateway was used
  paymentIntentId?: string;
  qrCodeId?: string; // NEW: For QR payments
  status: "pending" | "processing" | "completed" | "expired" | "failed" | "authorized" | "cancelled";
  expiresAt: Date;
  errorMessage?: string; // NEW: Store error messages
  metadata?: Record<string, any>; // NEW: For additional data
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
    paymentGateway: {
      type: String,
      sparse: true, // NEW: Optional field
    },
    paymentIntentId: {
      type: String,
      sparse: true,
    },
    qrCodeId: {
      type: String,
      sparse: true, // NEW: For QR payments
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "expired", "failed", "authorized", "cancelled"],
      default: "pending",
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    errorMessage: {
      type: String, // NEW: Store errors
    },
    metadata: {
      type: Schema.Types.Mixed, // NEW: For additional data
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Add indexes for better query performance
CheckoutSessionSchema.index({ userId: 1, status: 1 });
CheckoutSessionSchema.index({ paymentGateway: 1, status: 1 });

export default mongoose.models.CheckoutSession ||
  mongoose.model<ICheckoutSession>("CheckoutSession", CheckoutSessionSchema);