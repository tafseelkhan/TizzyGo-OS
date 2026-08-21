import mongoose, { Schema, Document } from "mongoose";

export interface ICheckoutSession extends Document {
  checkoutSessionId: string;
  userId: string;
  orderIds: mongoose.Types.ObjectId[];
  orderId?: string;
  transactionId?: mongoose.Types.ObjectId; // ✅ NEW
  cartSnapshot: {
    items: Array<{
      productId: string;
      quantity: number;
      selectedVariant?: Record<string, any>;
      productData: {
        productDataId: string;
        title?: string;
        price?: number;
        finalPrice?: number;
        mrp?: number;
        discount?: number;
        discountPercent?: number;
        offerText?: string;
        gstRate?: number;
        gstAmount?: number;
        sellerId?: string;
        zeptPayAccountId?: string;
        fulfillmentType?: string;
        cashOnDelivery?: boolean;
        appName?: string;
        productImage?: string;
        sellerLocation?: {
          address: string;
          latitude: number;
          longitude: number;
          googlePlaceId?: string;
        };
      };
      calculatedData?: {
        totalBeforeCoupon?: number;
        discountApplied?: number;
        deliveryCharge?: number;
        gstAmount?: number;
        gstRate?: number;
        platformFee?: number;
        packagingFee?: number;
        finalAmount?: number;
        distanceKm?: number;
        couponUsed?: string;
        couponData?: Record<string, any>;
        coFundApplied?: boolean;
        fundSplit?: { bank: number; merchant: number };
        mrp?: number;
        savedAmount?: number;
        discountPercent?: number;
        finalPrice?: number;
        subtotal?: number;
        price?: number;
        grandTotal?: number;
        volumetricWeight?: number;
        actualWeight?: number;
        chargeableWeight?: number;
        deliveryRatePerKm?: number;
        deliveryRatePerKg?: number;
      };
    }>;
    calculatedData: {
      totalBeforeCoupon: number;
      discountApplied: number;
      deliveryCharge: number;
      gstAmount: number;
      gstRate: number;
      platformFee: number;
      packagingFee: number;
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
  paymentGateway?: string;
  paymentIntentId?: string;
  qrCodeId?: string;
  status:
    | "pending"
    | "processing"
    | "completed"
    | "expired"
    | "failed"
    | "authorized"
    | "cancelled"
    | "refunded";
  expiresAt: Date;
  errorMessage?: string;
  metadata?: {
    idempotencyKey?: string;
    cartId?: string;
    cartCheckout?: boolean;
    checkoutType?: "single" | "cart" | "buy_now";
    isBuyNow?: boolean;
    productId?: string;
    variantId?: string;
    quantity?: number;
    itemCount?: number;
    sellerIds?: string[];
    grandTotal?: number;
    productTotal?: number;
    deliveryCharge?: number;
    platformFee?: number;
    packagingFee?: number;
    discount?: number;
    couponCode?: string | null;
    currency?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    webhookReceivedAt?: Date;
    webhookEventType?: string;
    webhookProcessedAt?: Date;
    createdAt?: Date;
    buyerName?: string;
    orderIds?: mongoose.Types.ObjectId[];
    transactionId?: mongoose.Types.ObjectId;
    cartCleared?: boolean; // ✅ NEW: Prevents duplicate cart clearing
  };
  completedAt?: Date;
  failedAt?: Date;
  refundedAt?: Date;
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
    orderIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      sparse: true,
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      sparse: true,
    },
    cartSnapshot: {
      items: [
        {
          productId: { type: String, required: true },
          quantity: { type: Number, required: true },
          selectedVariant: Schema.Types.Mixed,
          productData: {
            productDataId: { type: String, required: true },
            title: String,
            price: Number,
            finalPrice: Number,
            mrp: Number,
            discount: Number,
            discountPercent: Number,
            offerText: String,
            gstRate: Number,
            gstAmount: Number,
            sellerId: String,
            zeptPayAccountId: String,
            fulfillmentType: { type: String, default: "SELLER" },
            cashOnDelivery: { type: Boolean, default: false },
            appName: { type: String, default: "TizzyGo" },
            productImage: String,
            sellerLocation: {
              address: String,
              latitude: Number,
              longitude: Number,
              googlePlaceId: String,
            },
          },
          calculatedData: {
            totalBeforeCoupon: Number,
            discountApplied: Number,
            deliveryCharge: Number,
            gstAmount: Number,
            gstRate: Number,
            platformFee: Number,
            packagingFee: Number,
            finalAmount: Number,
            distanceKm: Number,
            couponUsed: String,
            couponData: Schema.Types.Mixed,
            coFundApplied: Boolean,
            fundSplit: {
              bank: Number,
              merchant: Number,
            },
            mrp: Number,
            savedAmount: Number,
            discountPercent: Number,
            finalPrice: Number,
            subtotal: Number,
            price: Number,
            grandTotal: Number,
            volumetricWeight: Number,
            actualWeight: Number,
            chargeableWeight: Number,
            deliveryRatePerKm: Number,
            deliveryRatePerKg: Number,
          },
        },
      ],
      calculatedData: {
        totalBeforeCoupon: { type: Number, required: true },
        discountApplied: { type: Number, default: 0 },
        deliveryCharge: { type: Number, default: 0 },
        gstAmount: { type: Number, default: 0 },
        gstRate: { type: Number, default: 0 },
        platformFee: { type: Number, default: 0 },
        packagingFee: { type: Number, default: 0 },
        finalAmount: { type: Number, required: true },
        distanceKm: { type: Number, default: 0 },
        couponUsed: String,
        couponData: Schema.Types.Mixed,
        coFundApplied: { type: Boolean, default: false },
        fundSplit: {
          bank: { type: Number, default: 0 },
          merchant: { type: Number, default: 0 },
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
      sparse: true,
    },
    paymentIntentId: {
      type: String,
      sparse: true,
    },
    qrCodeId: {
      type: String,
      sparse: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "expired",
        "failed",
        "authorized",
        "cancelled",
        "refunded",
      ],
      default: "pending",
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    errorMessage: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    completedAt: Date,
    failedAt: Date,
    refundedAt: Date,
  },
  {
    timestamps: true,
  },
);

CheckoutSessionSchema.index({ userId: 1, status: 1 });
CheckoutSessionSchema.index({ paymentGateway: 1, status: 1 });
CheckoutSessionSchema.index({ orderIds: 1 });
CheckoutSessionSchema.index({ "metadata.idempotencyKey": 1 });
CheckoutSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
CheckoutSessionSchema.index({ "metadata.razorpayPaymentId": 1 });
CheckoutSessionSchema.index({ "metadata.webhookReceivedAt": -1 });

export default mongoose.models.CheckoutSession ||
  mongoose.model<ICheckoutSession>("CheckoutSession", CheckoutSessionSchema);
