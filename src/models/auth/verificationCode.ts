import mongoose, { Document, Schema } from "mongoose";

export type VerificationPurpose =
  | "connect_verification"
  | "phone_verification"
  | "login_verification"
  | "password_reset"
  | "recovery_verification";

export interface IVerificationCode extends Document {
  userId?: mongoose.Types.ObjectId;
  destination: string;
  codeHash?: string;

  purpose: VerificationPurpose;

  expiresAt: Date;
  attempts: number;
  verifiedAt?: Date;
  consumedAt?: Date;

  /** Number of times an OTP has been resent for this verification record. */
  resendCount: number;
  lastResentAt?: Date;

  /**
   * After a successful password_reset OTP verification we issue a short-lived
   * single-use authorization token. Only the SHA-256 hash is stored.
   */
  resetTokenHash?: string;
  resetTokenExpiresAt?: Date;
  resetTokenUsedAt?: Date;

  // Temporary signup data: used only before phone OTP verification.
  signupData?: {
    firstName: string;
    lastName?: string;
    username: string;
    connectAddress: string;
    passwordHash: string;
    termsAccepted: boolean;
    termsAcceptedAt: Date;
    deviceName?: string;
    ipAddress?: string;
    userAgent?: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

export const verificationCodeSchema = new Schema<IVerificationCode>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    destination: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // Optional for Twilio Verify, which manages OTP codes itself.
    // Retained for other existing verification flows.
    codeHash: {
      type: String,
      required: false,
    },

    purpose: {
      type: String,
      enum: [
        "connect_verification",
        "phone_verification",
        "login_verification",
        "password_reset",
        "recovery_verification",
      ],
      required: true,
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    verifiedAt: {
      type: Date,
    },

    consumedAt: {
      type: Date,
    },

    resendCount: {
      type: Number,
      default: 0,
    },

    lastResentAt: {
      type: Date,
    },

    resetTokenHash: {
      type: String,
      index: true,
      sparse: true,
    },

    resetTokenExpiresAt: {
      type: Date,
    },

    resetTokenUsedAt: {
      type: Date,
    },

    signupData: {
      firstName: { type: String, trim: true, maxlength: 100 },
      lastName: { type: String, trim: true, maxlength: 100 },
      username: { type: String, lowercase: true, trim: true },
      connectAddress: { type: String, lowercase: true, trim: true },
      passwordHash: { type: String },
      termsAccepted: { type: Boolean },
      termsAcceptedAt: { type: Date },
      deviceName: { type: String },
      ipAddress: { type: String },
      userAgent: { type: String },
    },
  },
  {
    timestamps: true,
  },
);

// Automatically remove expired verification records.
// MongoDB TTL deletion is asynchronous; service code also checks expiresAt.
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Helpful compound indexes for common lookups
verificationCodeSchema.index({
  purpose: 1,
  destination: 1,
  expiresAt: 1,
  verifiedAt: 1,
});

verificationCodeSchema.index({
  purpose: 1,
  userId: 1,
  expiresAt: 1,
  verifiedAt: 1,
});
