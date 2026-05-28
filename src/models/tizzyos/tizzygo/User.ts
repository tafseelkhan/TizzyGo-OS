import mongoose, { Document, Schema } from "mongoose";

export interface ITizzyGoUser extends Document {
  name: string;
  email?: string;
  phone?: string;
  image?: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
}

const tizzyGoUserSchema = new Schema<ITizzyGoUser>(
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
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// 🧼 Clean inputs before saving
tizzyGoUserSchema.pre("save", function (next) {
  if (this.email) this.email = this.email.toLowerCase().trim();
  if (this.phone) this.phone = this.phone.trim();
  if (this.name) this.name = this.name.trim();
  next();
});

const TizzyGoUser = mongoose.models.TizzyGoUser || mongoose.model<ITizzyGoUser>("TizzyGoUser", tizzyGoUserSchema);
export default TizzyGoUser;
