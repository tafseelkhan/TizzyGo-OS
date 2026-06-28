// models/User.ts
import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  name: string;
  email?: string;
  phone?: string;
  image?: string;
  theme: "light" | "dark" | "system";
  roles: "BUYER" | "SELLER" | "FWS" | "SHIPPING" | "CAB" | "RENT";
  color?: string;
  vendorCodeUID: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  linkedAccountGroupId?: mongoose.Types.ObjectId; // ✅ NEW: Reference to account group
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      trim: true,
      required: true,
    },
    email: {
      type: String,
      lowercase: true,
      unique: true,
      sparse: true,
      trim: true,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    image: {
      type: String,
      default: "/images/default-profile.png",
    },
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system",
    },
    roles: {
      type: String,
      enum: ["BUYER", "SELLER", "FWS", "SHIPPING", "CAB", "RENT"],
      default: "SELLER",
    },
    vendorCodeUID: {
      type: String,
    },
    color: {
      type: String,
      required: false,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    linkedAccountGroupId: {
      type: Schema.Types.ObjectId,
      ref: "LinkedAccount",
      index: true,
    },
  },
  { timestamps: true },
);

// 🧼 Clean inputs before saving
userSchema.pre("save", function (next) {
  if (this.email) this.email = this.email.toLowerCase().trim();
  if (this.phone) this.phone = this.phone.trim();
  if (this.name) this.name = this.name.trim();
  next();
});

const User = mongoose.models.User || mongoose.model<IUser>("User", userSchema);
export default User;
