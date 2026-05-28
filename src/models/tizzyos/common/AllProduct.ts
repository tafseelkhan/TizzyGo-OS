// src/models/common/AllProduct.ts

import mongoose from 'mongoose';

const allProductSchema = new mongoose.Schema({
  productId: { type: String, required: true, unique: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String, enum: ['car', 'mobile', 'property', 'electronic'], required: true },
  createdAt: { type: Date, default: Date.now },
});

export const AllProduct = mongoose.model('AllProduct', allProductSchema);
