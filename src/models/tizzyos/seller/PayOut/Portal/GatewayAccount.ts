import mongoose, { Document, Schema } from "mongoose";

export interface IGatewayAccount extends Document {
  userId: mongoose.Types.ObjectId;

  gateway: "RAZORPAY";

  gatewayAccountId: string;
  gatewayStakeholderId?: string;
  gatewayProductId?: string;

  accountStatus?: string;
  onboardingStatus?: string;

  email: string;
  phone: string;
}

const gatewayAccountSchema = new Schema<IGatewayAccount>(
  {
    // ==========================================
    // TIZZYGO USER REFERENCE
    // ==========================================
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ==========================================
    // PAYMENT GATEWAY
    // ==========================================
    gateway: {
      type: String,
      enum: ["RAZORPAY"],
      default: "RAZORPAY",
      required: true,
      index: true,
    },

    // ==========================================
    // RAZORPAY LINKED ACCOUNT ID
    // Example: acc_xxxxxxxxxxxxxx
    // ==========================================
    gatewayAccountId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // ==========================================
    // RAZORPAY STAKEHOLDER ID
    // ==========================================
    gatewayStakeholderId: {
      type: String,
      trim: true,
    },

    // ==========================================
    // RAZORPAY PRODUCT CONFIGURATION ID
    // ==========================================
    gatewayProductId: {
      type: String,
      trim: true,
    },

    // ==========================================
    // RAZORPAY ACCOUNT STATUS
    // ==========================================
    accountStatus: {
      type: String,
      trim: true,
    },

    // ==========================================
    // ROUTE ONBOARDING / PRODUCT STATUS
    // ==========================================
    onboardingStatus: {
      type: String,
      trim: true,
      default: "requested",
    },

    // ==========================================
    // CONTACT DETAILS USED FOR GATEWAY ACCOUNT
    // ==========================================
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

const GatewayAccount =
  mongoose.models.GatewayAccount ||
  mongoose.model<IGatewayAccount>(
    "GatewayAccount",
    gatewayAccountSchema,
  );

export default GatewayAccount;