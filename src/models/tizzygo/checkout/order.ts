import mongoose, { Schema, Document } from "mongoose";

export interface IOrder extends Document {
  orderId: string;
  productId: string;
  sellerId?: string;
  sellerName: string;
  trackingId: string;
  buyerId?: string;
  buyerName: string;
  zeptPayAccountId?: string; // NEW: Store vendor account ID
  items: {
    quantity: number;
    selectedVariant?: Record<string, any>;
    productData: {
      productDataId: string;
    };
  }[];
  productPrice: number;
  productMrp: number;
  productSavedAmount: number;
  productDiscount: number;
  productOfferText: string;
  productFinalPrice: number;
  productGst: number;
  productGstRate: number;
  deliveryCharge: number;
  distanceKm: number;
  totalBeforeCoupon: number;
  discountApplied: number;
  platformFee: number;
  packagingFee: number;
  finalAmount: number;
  status:
    | "created"
    | "processing"
    | "authorized"
    | "captured"
    | "failed"
    | "cancelled"
    | "refunded"
    | "cod_confirmed";
  fulfillmentType: "SELLER" | "FWS";
  metadata?: Record<string, any>;
  shippingLabel?: {
    qrCodeUrl?: string;
    qrData: {
      token: string;
    };
  };
  paymentIntentId?: string;
  token: string;
  buyerAddress: {
    address: string;
    googlePlaceId?: string;
    latitude: number;
    longitude: number;
  };
  sellerAddress: {
    address: string;
    googlePlaceId?: string;
    latitude: number;
    longitude: number;
  };
  couponUsed?: string;
  couponData?: {
    discount: number;
    originalPrice: number;
    finalPrice: number;
    message?: string;
  };
  coFundApplied: boolean;
  fundSplit: {
    bank: number;
    merchant: number;
  };
  paymentAttempts?: Array<{
    paymentIntentId?: string;
    method: string;
    status: string;
    rawResponse: any;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema: Schema<IOrder> = new Schema(
  {
    orderId: { type: String, unique: true, required: true },
    productId: { type: String, required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    sellerName: { type: String, required: false },
    trackingId: { type: String, ref: "Tracking", index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    buyerName: { type: String, required: true },
    zeptPayAccountId: { type: String, sparse: true }, // NEW
    items: [
      {
        quantity: { type: Number, required: true },
        productData: { productDataId: { type: String, required: true } },
        selectedVariant: { type: Schema.Types.Mixed },
      },
    ],
    productPrice: { type: Number, required: true },
    productMrp: { type: Number },
    productSavedAmount: { type: Number },
    productDiscount: { type: Number },
    productOfferText: { type: String },
    productFinalPrice: { type: Number },
    productGst: { type: Number, default: 0 },
    productGstRate: { type: Number, default: 0 },
    deliveryCharge: { type: Number, default: 0 },
    distanceKm: { type: Number, default: 0 },
    totalBeforeCoupon: { type: Number, default: 0 },
    discountApplied: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    packagingFee: { type: Number, default: 0 },
    finalAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        "created",
        "processing",
        "authorized",
        "captured",
        "failed",
        "cancelled",
        "refunded",
        "cod_confirmed",
      ],
      default: "processing",
    },
    fulfillmentType: {
      type: String,
      enum: ["SELLER", "FWS"],
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    shippingLabel: {
      qrCodeUrl: { type: String },
      qrData: {
        token: { type: String, required: true },
      },
    },
    paymentIntentId: { type: String },
    token: { type: String, required: true },
    buyerAddress: {
      address: { type: String, required: true },
      googlePlaceId: { type: String },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    sellerAddress: {
      address: { type: String, required: true },
      googlePlaceId: { type: String },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    couponUsed: { type: String },
    couponData: {
      discount: { type: Number, default: 0 },
      originalPrice: { type: Number, default: 0 },
      finalPrice: { type: Number, default: 0 },
      message: { type: String },
    },
    coFundApplied: { type: Boolean, default: false },
    fundSplit: {
      bank: { type: Number, default: 0 },
      merchant: { type: Number, default: 0 },
    },
    paymentAttempts: [
      {
        paymentIntentId: { type: String },
        method: { type: String },
        status: { type: String },
        rawResponse: { type: Schema.Types.Mixed },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

// Index for payment intent lookups
OrderSchema.index({ paymentIntentId: 1 }, { sparse: true });

export default mongoose.models.Order ||
  mongoose.model<IOrder>("Order", OrderSchema);
