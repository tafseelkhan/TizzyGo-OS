import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICustomField {
  label: string;
  value: string;
}

export interface IProductRequest extends Document {
  productId: string;
  userId: mongoose.Types.ObjectId;
  productData: any;
  status: "pending" | "approved" | "rejected";
  rejectReason?: string;
  customFields?: ICustomField[]; // 👈 yeh add kiya
  createdAt: Date;
  updatedAt: Date;
  requestedAt: Date;
}

const ProductRequestSchema = new Schema<IProductRequest>(
  {
    productId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    productData: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectReason: { type: String, default: "" },

    // 👇 yahan fields ka array define karna hai
    customFields: [
      {
        label: { type: String, required: true },
        value: { type: String, required: true },
      },
    ],

    requestedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const ProductRequest: Model<IProductRequest> =
  mongoose.models.ProductRequest ||
  mongoose.model<IProductRequest>("ProductRequest", ProductRequestSchema);

export default ProductRequest;
