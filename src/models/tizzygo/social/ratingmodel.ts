import mongoose, { Document } from "mongoose";

interface IReviewImage {
  url: string;
  publicId: string;
}

interface IRatingReview extends Document {
  userId: mongoose.Types.ObjectId;
  productId: string;
  rating: number;
  review?: string;
  images?: IReviewImage[];
  createdAt: Date;
  updatedAt: Date;
}

const ratingReviewSchema = new mongoose.Schema<IRatingReview>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    productId: {
      type: String,
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "{VALUE} is not an integer value",
      },
    },
    review: {
      type: String,
      maxlength: 1000,
    },
    images: [
      {
        url: String,
        publicId: String,
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for one rating per user per product
ratingReviewSchema.index({ userId: 1, productId: 1 }, { unique: true });

export const RatingReview = mongoose.model<IRatingReview>(
  "RatingReview",
  ratingReviewSchema
);
