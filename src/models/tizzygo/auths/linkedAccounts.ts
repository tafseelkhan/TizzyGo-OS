// models/LinkedAccount.ts
import mongoose, { Document, Schema } from "mongoose";

export interface ILinkedAccount extends Document {
  // ✅ Primary owner (who created the group)
  primaryOwnerId: mongoose.Types.ObjectId;

  // ✅ All accounts in the group
  accounts: {
    userId: mongoose.Types.ObjectId;
    roles: "SELLER" | "FWS" | "SHIPPING" | "BUYER" | "CAB" | "RENT";
    isPrimary: boolean; // ✅ Which account is the primary
    addedAt: Date;
  }[];

  createdAt: Date;
  updatedAt: Date;
}

const linkedAccountSchema = new Schema<ILinkedAccount>(
  {
    primaryOwnerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    accounts: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        roles: {
          type: String,
          enum: ["BUYER", "SELLER", "FWS", "SHIPPING", "CAB", "RENT"],
          required: true,
        },
        isPrimary: {
          type: Boolean,
          default: false,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// ✅ Indexes for performance
linkedAccountSchema.index({ primaryOwnerId: 1 });
linkedAccountSchema.index({ "accounts.userId": 1 });
linkedAccountSchema.index({ "accounts.userId": 1, "accounts.role": 1 });

// ✅ Ensure one primary per group
// ✅ Ensure one primary per group
linkedAccountSchema.pre("save", async function () {
  const primaryCount = this.accounts.filter((a) => a.isPrimary).length;
  if (primaryCount !== 1) {
    throw new Error("Exactly one primary account is required per group");
  }
});

// ✅ Prevent duplicate users in same group
linkedAccountSchema.pre("save", async function () {
  const userIds = this.accounts.map((a) => a.userId.toString());
  const uniqueIds = new Set(userIds);
  if (userIds.length !== uniqueIds.size) {
    throw new Error("Duplicate user accounts in the same group");
  }
});

const LinkedAccount =
  mongoose.models.LinkedAccount ||
  mongoose.model<ILinkedAccount>("LinkedAccount", linkedAccountSchema);

export default LinkedAccount;
