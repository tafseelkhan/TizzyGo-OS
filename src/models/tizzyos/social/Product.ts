import mongoose, { Schema, Document } from 'mongoose';

interface IRating {
  user: mongoose.Types.ObjectId;
  value: number;
  createdAt: Date;
}

export interface IProduct extends Document {
  title: string;
  owner: mongoose.Types.ObjectId;
  likes: mongoose.Types.ObjectId[];
  shares: number;
  ratings: IRating[];
  createdAt: Date;
}

const ratingSchema = new Schema<IRating>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  value: { type: Number, min: 1, max: 5, required: true },
  createdAt: { type: Date, default: Date.now }
});

const productSchema = new Schema<IProduct>({
  title: String,
  owner: { type: Schema.Types.ObjectId, ref: 'User' },
  likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  shares: { type: Number, default: 0 },
  ratings: [ratingSchema],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IProduct>('Product', productSchema);
