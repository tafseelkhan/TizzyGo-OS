import mongoose from 'mongoose';

const likeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Product' },
});

export const ProductLike = mongoose.model('ProductLike', likeSchema);
