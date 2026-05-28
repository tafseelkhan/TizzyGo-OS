import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  name: string;
  email?: string;
  phone?: string;
  image?: string;
  theme: "light" | "dark" | "system";
  color?: string;
  vendorCodeUID: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
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
