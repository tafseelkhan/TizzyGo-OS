// models/Product.model.ts
import mongoose, { Schema, Document, Model } from "mongoose";
import crypto from "crypto";

/* ================= TYPES ================= */

// Variant fields (dynamic like Storage, RAM, Color)
interface IVariantFields {
  [key: string]: string;
}

// Individual Variant Structure
interface IProductVariant {
  variantId: string;
  fields: IVariantFields;
  combinationKey: string;

  // 🔥 Ye sab variant ke ANDAR honge (as you requested)
  mrp: number;
  price: number;
  savedAmount: number;
  discount: number;
  offerText?: string;
  finalPrice: number;

  // Physical specs per variant
  weight?: string;
  height?: string;
  width?: string;
  length?: string;

  // Stock
  inStock: boolean;
  quantityAvailable: number;

  // Other variant fields
  sku: string;
  images: string[];
  video?: string;
  isDefault: boolean;
}

// Main Product Interface
interface IProduct extends Document {
  // Basic Info (outside variant)
  title: string;
  brand: string;
  description: string;
  category: string;
  subcategory: string;
  productId: string;
  vendorCodeUID: string; // Unique code for vendor to identify product (optional)
  sellerId: mongoose.Types.ObjectId;

  // Delivery/Policy (same for all variants)
  deliveryTime: string;
  warranty: string;
  returnPolicy: string;

  // Descriptions
  shortDescription: string;
  fullDescription: string;
  highlights: string[];

  // Seller Location
  sellerLocation: {
    address: string;
    latitude: number;
    longitude: number;
    googlePlaceId: string;
  };

  // 🔥 Dynamic Specs (from category JSON - ye variant ke bahar)
  specs: Map<string, any>;

  // Variant System Fields
  variantOptions: string[]; // e.g., ["Storage", "RAM", "Color"]
  variantValues: Map<string, string[]>; // e.g., { "Storage": ["128GB", "256GB"] }
  variants: IProductVariant[];
  gstRate: number;
  gstSource: string; // "auto" or "manual"
  // 🏭 Fulfillment (SELLER + FFC FLOW FIXED)
  fulfillmentType: "SELLER" | "FFC";
  // Extra boolean flags
  protectPromiseFees: boolean;
  freeDelivery: boolean;
  fastDelivery: boolean;
  safety: boolean;
  productQuality: boolean;
  paymentOptions: boolean;
  manufacturer: boolean;
  cashOnDelivery: boolean;
  deliveryVehicleType: boolean;

  verified: boolean;

  createdAt: Date;
  updatedAt: Date;
}

/* ================= VARIANT SCHEMA (ANDAR SAB KUCH) ================= */
const ProductVariantSchema = new Schema<IProductVariant>(
  {
    variantId: {
      type: String,
      required: true,
      unique: true,
      default: () => crypto.randomBytes(16).toString("hex"),
    },
    fields: {
      type: Map,
      of: String,
      required: true,
    },
    combinationKey: {
      type: String,
      required: true,
      index: true,
    },

    // 🔥 Pricing - Variant ke andar
    mrp: {
      type: Number,
      required: true,
      min: 0,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    savedAmount: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    offerText: {
      type: String,
    },
    finalPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // Physical Specs - Variant ke andar
    weight: { type: String },
    height: { type: String },
    width: { type: String },
    length: { type: String },

    // Stock - Variant ke andar
    inStock: {
      type: Boolean,
      default: false,
    },
    quantityAvailable: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Other variant fields
    sku: {
      type: String,
      required: true,
      unique: true,
    },
    images: [
      {
        type: String,
        required: true,
      },
    ],
    video: { type: String },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false, timestamps: true },
);

/* ================= MAIN PRODUCT SCHEMA ================= */
const ProductSchema = new Schema<IProduct>(
  {
    // Basic Info (variant ke bahar)
    title: {
      type: String,
      required: true,
      index: true,
    },
    brand: {
      type: String,
      required: true,
      index: true,
    },
    description: { type: String },
    category: {
      type: String,
      required: true,
      index: true,
    },
    subcategory: {
      type: String,
      required: true,
      index: true,
    },
    productId: {
      type: String,
      unique: true,
      index: true,
    },
    vendorCodeUID: {
      type: String,
      required: true,
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },

    // Delivery/Policy (same for all variants)
    deliveryTime: { type: String },
    warranty: { type: String },
    returnPolicy: { type: String },

    // Descriptions
    shortDescription: { type: String },
    fullDescription: { type: String },
    highlights: [{ type: String, default: [] }],

    // Seller Location
    sellerLocation: {
      address: { type: String },
      latitude: { type: Number },
      longitude: { type: Number },
      googlePlaceId: { type: String },
    },

    // 🔥 Dynamic Specs (from category JSON - variant ke bahar)
    specs: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },

    // Variant System Fields
    variantOptions: [
      {
        type: String,
        required: true,
      },
    ],
    variantValues: {
      type: Map,
      of: [String],
      required: true,
    },
    variants: [ProductVariantSchema],
    gstRate: {
      type: Number,
      required: true,
    },
    gstSource: {
      type: String,
      required: true,
      enum: ["auto", "manual"],
    },
    // 🏭 Fulfillment FIXED
    fulfillmentType: {
      type: String,
      enum: ["SELLER", "FFC"],
      required: true,
    },
    // Extra boolean flags
    protectPromiseFees: { type: Boolean, default: false },
    freeDelivery: { type: Boolean, default: false },
    fastDelivery: { type: Boolean, default: false },
    safety: { type: Boolean, default: false },
    productQuality: { type: Boolean, default: false },
    paymentOptions: { type: Boolean, default: false },
    manufacturer: { type: Boolean, default: false },
    cashOnDelivery: { type: Boolean, default: false },
    deliveryVehicleType: { type: Boolean, default: false },

    verified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Indexes for performance
ProductSchema.index({ "variants.combinationKey": 1 });
ProductSchema.index({ "variants.sku": 1 });
ProductSchema.index({ "variants.variantId": 1 });
ProductSchema.index({ category: 1, subcategory: 1 });
ProductSchema.index({ sellerId: 1, "variants.inStock": 1 });

// Virtual for default variant
ProductSchema.virtual("defaultVariant").get(function (this: IProduct) {
  return this.variants.find((v) => v.isDefault) || this.variants[0];
});

// Method to validate variant uniqueness
ProductSchema.methods.validateVariantUniqueness = function (
  newVariants: IProductVariant[],
): boolean {
  const combinationKeys = new Set();
  const skus = new Set();

  for (const variant of newVariants) {
    if (combinationKeys.has(variant.combinationKey)) {
      throw new Error(`Duplicate combination key: ${variant.combinationKey}`);
    }
    if (skus.has(variant.sku)) {
      throw new Error(`Duplicate SKU: ${variant.sku}`);
    }
    combinationKeys.add(variant.combinationKey);
    skus.add(variant.sku);
  }

  return true;
};

export const Product = mongoose.model<IProduct>("Product", ProductSchema);
