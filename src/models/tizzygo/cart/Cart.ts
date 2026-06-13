import mongoose, { Schema, Document } from "mongoose";

export interface ICart extends Document {
  userId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  quantity: number;
  productData: {
    productDataId: string;
    vendorCodeUID: string;
    sellerId: mongoose.Types.ObjectId;
  };
  selectedVariant?: any;
  couponCode?: string;
  discountApplied?: number;
  calculated?: {
    // Per product pricing
    mrp: number;
    price: number;
    finalPrice: number;
    savedAmount: number;
    discountPercent: number;

    // Quantity based
    quantity: number;
    totalMrp: number;
    totalFinalPrice: number;
    totalSavedAmount: number;

    // GST (category/subcategory based)
    gstRate: number;
    gstType: string;
    gstAmount: number;
    perProductGst: number;

    // Platform & Shipping fee
    platformFee: number;
    packagingFee: number;

    // Delivery with full breakdown
    deliveryCharge: number;
    distanceKm: number;
    volumetricWeight: number;
    actualWeight: number;
    chargeableWeight: number;
    deliveryRatePerKm: number;
    deliveryRatePerKg: number;

    // Totals
    subtotal: number;
    totalBeforeCoupon: number;
    discountAppliedAmount: number;
    grandTotal: number;

    // Coupon
    couponUsed?: string | null;
    couponData?: {
      discount: number;
      originalPrice: number;
      finalPrice: number;
      message?: string;
    } | null;

    // Locations
    buyerLocation?: {
      address?: string;
      latitude?: number;
      longitude?: number;
      googlePlaceId?: string;
    };
    sellerLocation?: {
      address?: string;
      latitude?: number;
      longitude?: number;
      googlePlaceId?: string;
    };
  };
}

const cartItemSchema = new Schema<ICart>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
      max: 100,
    },
    productData: {
      productDataId: { type: String, required: true },
      vendorCodeUID: { type: String, required: true },
      sellerId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    },
    selectedVariant: {
      type: Schema.Types.Mixed,
      default: null,
    },
    couponCode: {
      type: String,
      default: null,
      index: true,
    },
    discountApplied: {
      type: Number,
      default: 0,
    },
    calculated: {
      // Per product pricing
      mrp: { type: Number, default: 0 },
      price: { type: Number, default: 0 },
      finalPrice: { type: Number, default: 0 },
      savedAmount: { type: Number, default: 0 },
      discountPercent: { type: Number, default: 0 },

      // Quantity based
      quantity: { type: Number, default: 1 },
      totalMrp: { type: Number, default: 0 },
      totalFinalPrice: { type: Number, default: 0 },
      totalSavedAmount: { type: Number, default: 0 },

      // GST
      gstRate: { type: Number, default: 0 },
      gstType: { type: String },
      gstAmount: { type: Number, default: 0 },
      perProductGst: { type: Number, default: 0 },

      platformFee: { type: Number, default: 0 },
      packagingFee: { type: Number, default: 0 },

      // Delivery
      deliveryCharge: { type: Number, default: 0 },
      distanceKm: { type: Number, default: 0 },
      volumetricWeight: { type: Number, default: 0 },
      actualWeight: { type: Number, default: 0 },
      chargeableWeight: { type: Number, default: 0 },
      deliveryRatePerKm: { type: Number, default: 0 },
      deliveryRatePerKg: { type: Number, default: 0 },

      // Totals
      subtotal: { type: Number, default: 0 },
      totalBeforeCoupon: { type: Number, default: 0 },
      discountAppliedAmount: { type: Number, default: 0 },
      grandTotal: { type: Number, default: 0 },

      // Coupon
      couponUsed: { type: String, default: null },
      couponData: {
        discount: { type: Number, default: 0 },
        originalPrice: { type: Number, default: 0 },
        finalPrice: { type: Number, default: 0 },
        message: { type: String, default: null },
      },

      // Locations
      buyerLocation: {
        address: { type: String, default: null },
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
        googlePlaceId: { type: String, default: null },
      },
      sellerLocation: {
        address: { type: String, default: null },
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
        googlePlaceId: { type: String, default: null },
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes
cartItemSchema.index({ userId: 1, productId: 1 });
cartItemSchema.index({ userId: 1, createdAt: -1 });
cartItemSchema.index({ couponCode: 1 });

export default mongoose.models.Cart ||
  mongoose.model<ICart>("Cart", cartItemSchema);
