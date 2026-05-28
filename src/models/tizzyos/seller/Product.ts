import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  productId: { type: String, required: true, unique: true },
  title: String,
  brand: String,
  description: String,
  category: String,
  subcategory: String,
  price: Number,
  mrp: Number,
  discountPercent: Number,
  stock: Number,
  sku: String,
  features: [String],
  mainImage: String,
  optionalImages: [String],
  video: String,
  deliveryEstimate: String,
  codAvailable: Boolean,
  searchKeywords: [String],
  returnPolicy: String,
  fulfilledBy: String,
  deliveryCharge: Number,
  fullName: String,
  profileImage: String,
}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);
export default Product;
