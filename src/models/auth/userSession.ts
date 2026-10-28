import mongoose, { Document, Schema } from "mongoose";

export interface IUserSession extends Document {
  userId: mongoose.Types.ObjectId;

  sessionTokenHash: string;

  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;

  expiresAt: Date;
  revokedAt?: Date;

  lastUsedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const userSessionSchema = new Schema<IUserSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    sessionTokenHash: {
      type: String,
      required: true,
      unique: true,
    },

    deviceName: {
      type: String,
      trim: true,
    },

    ipAddress: {
      type: String,
    },

    userAgent: {
      type: String,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    revokedAt: {
      type: Date,
    },

    lastUsedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);
