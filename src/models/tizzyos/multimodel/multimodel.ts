// src/models.ts
import mongoose from "mongoose";

/**
 * Product snapshot (embedded in Cart / Order)
 */
export const ProductSnapshotSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  category: String,
  subCategory: String,
  brand: String,
  images: [
    {
      urls: [String],
    },
  ],
  attributes: {
    color: [String],
    size: [String],
    material: [String],
    patternDetail: String,
  },
  price: { type: Number, default: 0 }, // base unit price
  finalPrice: { type: Number, default: 0 }, // after discount
  offer: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  gst: { type: Number, default: 18 },
  delivery: { type: String, enum: ["Free", "Paid"], default: "Paid" },
  deliveryLocation: {
    lat: { type: Number },
    lng: { type: Number },
    country: { type: String },
    state: { type: String },
    city: { type: String },
  },
  fastDelivery: { type: Boolean, default: false },
  cashOnDelivery: { type: Boolean, default: false },
  warranty: String,
  safety: String,
  returnPolicyExtra: String,
  productQuality: String,
  paymentOptions: [String],
  manufacturer: String,
  negotiable: { type: String, enum: ["YES", "NO"], default: "NO" },
  isDraft: { type: Boolean, default: false },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

/**
 * Cart model
 */
export const CartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  productData: { type: ProductSnapshotSchema, required: true },
  quantity: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
});
export const Cart = mongoose.model("Cart", CartSchema);

/**
 * Coupon model
 */
export const CouponSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  discountAmount: { type: Number, default: 0 },
  minApplicablePrice: { type: Number, default: 0 },
  maxApplicablePrice: { type: Number, default: Number.MAX_SAFE_INTEGER },
  expiresAt: { type: Date, required: true },
  usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now },
});
export const Coupon = mongoose.model("Coupon", CouponSchema);

/**
 * Order model
 */
export const OrderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  product: { type: ProductSnapshotSchema, required: true },
  quantity: { type: Number, default: 1 },
  coupon: {
    code: String,
    discountAmount: Number,
  },
  breakdown: {
    productPrice: Number,
    offer: Number,
    discount: Number,
    couponDiscount: Number,
    gst: Number,
    packaging: Number,
    shipping: Number,
    platformFee: Number,
    total: Number,
  },
  sellerLocation: {
    country: String,
    state: String,
    city: String,
  },
  payment: {
    gateway: String,
    razorpayOrderId: String,
    paymentLink: String,
    paymentLinkId: String,
    paymentStatus: { type: String, default: "unpaid" },
  },
  status: { type: String, default: "pending" },
  qrVersion: { type: Number, default: 0 },
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now },
});
export const Order = mongoose.model("Order", OrderSchema);
