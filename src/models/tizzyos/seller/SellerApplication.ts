import mongoose, { Schema, Document, Types } from "mongoose";

export interface ISellerApplication extends Document {
  uniqOsId?: string;

  userId: Types.ObjectId;

  fullName: string;
  email: string;
  phone: string;

  address: string;
  pincode: string;

  shopName: string;
  category: string;
  gstNumber?: string;

  documents: {
    type: string;
    url: string;
  }[];

  status: "pending" | "approved" | "rejected";

  rejectionReason?: string;
  approvedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const SellerApplicationSchema = new Schema<ISellerApplication>(
  {
    uniqOsId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    pincode: {
      type: String,
      required: true,
      trim: true,
    },

    shopName: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    gstNumber: {
      type: String,
      trim: true,
    },

    documents: [
      {
        type: {
          type: String,
          required: true,
        },

        url: {
          type: String,
          required: true,
        },
      },
    ],

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    rejectionReason: {
      type: String,
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.models.SellerApplication ||
  mongoose.model<ISellerApplication>(
    "SellerApplication",
    SellerApplicationSchema,
  );
