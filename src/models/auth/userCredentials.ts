import mongoose, { Document, Schema } from "mongoose";

export interface IUserCredentials extends Document {
  userId: mongoose.Types.ObjectId;

  passwordHash: string;

  passwordChangedAt: Date;

  failedLoginAttempts: number;

  lockedUntil?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const userCredentialsSchema = new Schema<IUserCredentials>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    passwordHash: {
      type: String,
      required: true,
    },

    passwordChangedAt: {
      type: Date,
      default: Date.now,
    },

    failedLoginAttempts: {
      type: Number,
      default: 0,
    },

    lockedUntil: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);
