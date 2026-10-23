import mongoose, { Document, Schema } from "mongoose";

// ======================================================
// TYPES
// ======================================================

export type FundAccountType =
  | "bank_account"
  | "vpa"
  | "wallet";

export type FundAccountStatus =
  | "active"
  | "inactive"
  | "pending"
  | "failed";

export type WalletProvider =
  | "amazonpay";

export type GatewayAccountStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "PENDING";

export type PayoutStatus =
  | "queued"
  | "pending"
  | "rejected"
  | "processing"
  | "processed"
  | "cancelled"
  | "reversed";

// ======================================================
// WALLET DETAILS
// ======================================================

export interface IGatewayWallet {
  provider: WalletProvider;

  phone: string;

  email?: string;

  name?: string;
}

// ======================================================
// FUND ACCOUNT
// ======================================================

export interface IGatewayFundAccount {
  fundAccountId: string;

  accountType: FundAccountType;

  status: FundAccountStatus;

  // ------------------------------------------
  // BANK ACCOUNT
  // ------------------------------------------

  bankAccountName?: string;

  bankAccountNumber?: string;

  bankIfsc?: string;

  // ------------------------------------------
  // UPI
  // ------------------------------------------

  vpaAddress?: string;

  // ------------------------------------------
  // WALLET
  // ------------------------------------------

  walletProvider?: WalletProvider;

  walletPhone?: string;

  walletEmail?: string;

  walletName?: string;

  // ------------------------------------------
  // DEFAULT
  // ------------------------------------------

  isDefault: boolean;

  createdAt?: Date;

  updatedAt?: Date;
}

// ======================================================
// MAIN GATEWAY ACCOUNT
// ======================================================

export interface IGatewayAccount extends Document {
  userId: mongoose.Types.ObjectId;

  gateway: "RAZORPAY";

  // ------------------------------------------
  // TIZZYGO REFERENCE
  // ------------------------------------------

  referenceId: string;

  // ------------------------------------------
  // RAZORPAYX CONTACT
  // ------------------------------------------

  contactId: string;

  contactType: string;

  name: string;

  email: string;

  phone: string;

  // ------------------------------------------
  // FUND ACCOUNTS
  // ------------------------------------------

  fundAccounts: IGatewayFundAccount[];

  // ------------------------------------------
  // LOCAL STATUS
  // ------------------------------------------

  status: GatewayAccountStatus;

  createdAt: Date;

  updatedAt: Date;
}

// ======================================================
// WALLET SCHEMA
// ======================================================

const walletSchema = new Schema<IGatewayWallet>(
  {
    provider: {
      type: String,
      enum: ["amazonpay"],
      required: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    name: {
      type: String,
      trim: true,
    },
  },
  {
    _id: false,
  },
);

// ======================================================
// FUND ACCOUNT SUB-SCHEMA
// ======================================================

const fundAccountSchema =
  new Schema<IGatewayFundAccount>(
    {
      // ==========================================
      // RAZORPAY FUND ACCOUNT ID
      // ==========================================

      fundAccountId: {
        type: String,

        required: true,

        trim: true,
      },

      // ==========================================
      // ACCOUNT TYPE
      // ==========================================

      accountType: {
        type: String,

        enum: [
          "bank_account",
          "vpa",
          "wallet",
        ],

        required: true,
      },

      // ==========================================
      // RAZORPAY STATUS
      // ==========================================

      status: {
        type: String,

        enum: [
          "active",
          "inactive",
          "pending",
          "failed",
        ],

        default: "active",
      },

      // ==========================================
      // BANK ACCOUNT
      // ==========================================

      bankAccountName: {
        type: String,

        trim: true,
      },

      bankAccountNumber: {
        type: String,

        trim: true,
      },

      bankIfsc: {
        type: String,

        trim: true,

        uppercase: true,
      },

      // ==========================================
      // UPI
      // ==========================================

      vpaAddress: {
        type: String,

        trim: true,

        lowercase: true,
      },

      // ==========================================
      // WALLET
      // ==========================================

      walletProvider: {
        type: String,

        enum: [
          "amazonpay",
        ],
      },

      walletPhone: {
        type: String,

        trim: true,
      },

      walletEmail: {
        type: String,

        trim: true,

        lowercase: true,
      },

      walletName: {
        type: String,

        trim: true,
      },

      // ==========================================
      // DEFAULT
      // ==========================================

      isDefault: {
        type: Boolean,

        default: false,
      },
    },

    {
      _id: false,

      timestamps: true,
    },
  );

// ======================================================
// MAIN SCHEMA
// ======================================================

const gatewayAccountSchema =
  new Schema<IGatewayAccount>(
    {
      // ==========================================
      // USER
      // ==========================================

      userId: {
        type: Schema.Types.ObjectId,

        ref: "User",

        required: true,

        index: true,
      },

      // ==========================================
      // GATEWAY
      // ==========================================

      gateway: {
        type: String,

        enum: [
          "RAZORPAY",
        ],

        default: "RAZORPAY",

        required: true,

        index: true,
      },

      // ==========================================
      // TIZZYGO REFERENCE
      // ==========================================

      referenceId: {
        type: String,

        required: true,

        trim: true,

        maxlength: 40,

        index: true,
      },

      // ==========================================
      // RAZORPAYX CONTACT
      // ==========================================

      contactId: {
        type: String,

        required: true,

        unique: true,

        index: true,

        trim: true,
      },

      // ==========================================
      // CONTACT TYPE
      // ==========================================

      contactType: {
        type: String,

        required: true,

        trim: true,

        maxlength: 40,
      },

      // ==========================================
      // CONTACT DETAILS
      // ==========================================

      name: {
        type: String,

        required: true,

        trim: true,
      },

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

      // ==========================================
      // FUND ACCOUNTS
      // ==========================================

      fundAccounts: {
        type: [
          fundAccountSchema,
        ],

        default: [],
      },

      // ==========================================
      // LOCAL STATUS
      // ==========================================

      status: {
        type: String,

        enum: [
          "ACTIVE",
          "INACTIVE",
          "PENDING",
        ],

        default: "ACTIVE",
      },
    },

    {
      timestamps: true,
    },
  );

// ======================================================
// USER + GATEWAY UNIQUE
// ======================================================

gatewayAccountSchema.index(
  {
    userId: 1,

    gateway: 1,
  },
  {
    unique: true,
  },
);

// ======================================================
// MODEL
// ======================================================

const GatewayAccount =
  mongoose.models.GatewayAccount ||
  mongoose.model<IGatewayAccount>(
    "GatewayAccount",
    gatewayAccountSchema,
  );

export default GatewayAccount;