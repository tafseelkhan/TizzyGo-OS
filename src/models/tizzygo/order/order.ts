import mongoose, { Schema, Document } from "mongoose";

export interface IOrder extends Document {
  orderId: string;

  productId: string;

  sellerId?: string;
  riderId?: string;
  buyerId?: string;
  buyerName: string;

  items: {
    quantity: number;
    selectedVariant?: Record<string, any>;
    productData: Record<string, any> & {
      buyerId?: string;
      buyerName?: string;
      sellerLocation?: any;
      buyerLocation?: any;
    };
    sellerId: string;
  }[];

  // Pricing
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
  finalAmount: number;

  // Order main status
  status: "created" | "processing" | "authorized" | "captured" | "failed" | "cancelled" | "refunded" | "cod_confirmed";

  // 🏭 Fulfillment (SELLER + FFC FLOW FIXED)
  fulfillmentType: "SELLER" | "FFC";

  fulfillmentStatus:
    | "processing"
    | "waiting_for_seller"
    | "in_seller_handover"
    | "received_at_warehouse"
    | "quality_check"
    | "packed"
    | "ready_for_dispatch";

  // 🚚 Delivery (RIDER FLOW FIXED)
  deliveryStatus:
    | "pending_rider_accept"
    | "waiting_for_rider"
    | "waiting_for_seller"
    | "assigned"
    | "picked_up"
    | "in_transit"
    | "out_for_delivery"
    | "delivered";

  paymentIntentId?: string;
  token: string;

  // Addresses
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

  riderLocation?: {
    address?: string;
    latitude?: number;
    longitude?: number;
    googlePlaceId?: string;
    updatedAt: Date;
  };

  // Coupon
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

  // Tracking timestamps
  assignedAt?: Date;
  pickedUpAt?: Date;
  deliveredAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema: Schema<IOrder> = new Schema(
  {
    orderId: { type: String, unique: true, required: true },

    productId: { type: String, required: true },

    sellerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    riderId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", index: true },

    buyerName: { type: String, required: true },

    items: [
      {
        quantity: { type: Number, required: true },

        productData: { type: Schema.Types.Mixed, required: true },

        selectedVariant: { type: Schema.Types.Mixed },

        sellerId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
          index: true,
        },
      },
    ],

    // Pricing
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

    finalAmount: { type: Number, required: true },

    // Status
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

    // 🏭 Fulfillment FIXED
    fulfillmentType: {
      type: String,
      enum: ["SELLER", "FFC"],
      required: true,
    },

    fulfillmentStatus: {
      type: String,
      enum: [
        "processing",
        "waiting_for_seller",
        "in_seller_handover",
        "received_at_warehouse",
        "quality_check",
        "packed",
        "ready_for_dispatch",
      ],
      default: "processing",
    },

    // 🚚 Delivery FIXED
    deliveryStatus: {
      type: String,
      enum: [
        "pending_rider_accept",
        "waiting_for_seller",
        "waiting_for_rider",
        "assigned",
        "picked_up",
        "in_transit",
        "out_for_delivery",
        "delivered",
      ],
      default: "waiting_for_seller",
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

    riderLocation: {
      address: { type: String },
      latitude: { type: Number },
      longitude: { type: Number },
      googlePlaceId: { type: String },
      updatedAt: { type: Date, default: Date.now },
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

    assignedAt: Date,
    pickedUpAt: Date,
    deliveredAt: Date,
  },
  { timestamps: true },
);

export default mongoose.models.Order ||
  mongoose.model<IOrder>("Order", OrderSchema);
