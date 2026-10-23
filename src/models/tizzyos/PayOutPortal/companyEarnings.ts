// models/tizzyos/PayOutPortal/companyEarnings.ts

import mongoose, { Document, Model, Schema } from "mongoose";

export interface ICompanyEarning extends Document {
  // TizzyGo unique company earning reference
  // Example: cpp_aB3kL9mZpQxY7TnRw2K
  payoutId: string;

  orderId: mongoose.Types.ObjectId;

  transactionId?: mongoose.Types.ObjectId;

  orderNumber?: string;

  grossAmount: number;

  platformFee: number;

  productGst: number;

  companyEarning: number;

  createdAt: Date;
  updatedAt: Date;
}

const CompanyEarningSchema = new Schema<ICompanyEarning>(
  {
    // ======================================================
    // TIZZYGO UNIQUE COMPANY EARNING ID
    // ======================================================

    payoutId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
      index: true,
    },

    transactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
      index: true,
    },

    orderNumber: {
      type: String,
      default: null,
      index: true,
    },

    grossAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    /**
     * Company commission
     */
    platformFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    /**
     * Product GST retained/recorded
     * on company side.
     */
    productGst: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    /**
     * Company earning:
     *
     * platformFee + productGst
     */
    companyEarning: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: "company_earnings",
  },
);

CompanyEarningSchema.index({
  createdAt: -1,
});

const CompanyEarningModel: Model<ICompanyEarning> =
  mongoose.models.CompanyEarning ||
  mongoose.model<ICompanyEarning>("CompanyEarning", CompanyEarningSchema);

export default CompanyEarningModel;
