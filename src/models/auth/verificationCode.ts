
import mongoose, { Document, Schema } from "mongoose";

export interface IVerificationCode extends Document {
  userId?: mongoose.Types.ObjectId;
  destination: string;
  codeHash?: string;

  purpose:
    | "connect_verification"
    | "phone_verification"
    | "password_reset"
    | "recovery_verification";

  expiresAt: Date;
  attempts: number;
  verifiedAt?: Date;

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
        "password_reset",
        "recovery_verification",
      ],
      required: true,
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
