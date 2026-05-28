import mongoose from "mongoose";

const profileSchema = new mongoose.Schema(
      {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // ✅ Each user has one profile
    },

    bio: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    country: { type: String, default: "" },
    profileImage: { type: String, default: "" },

    phone: { type: String },
    fullname: { type: String },
    username: { type: String },
    email: { type: String },

    businessType: {
      type: String,
      enum: ["individual", "company", "partnership", "freelancer", "other"], // ✅ added all frontend options
      default: "individual"
    },

    category: {
      type: String,
      enum: ["retail", "wholesale", "manufacturer", "service", "other"], // ✅ matches frontend
      default: "other"
    },

    gstOrPan: { type: String },
    address: { type: String },

    sellerID: { type: Boolean, default: false },
    riderID: { type: Boolean, default: false },
    rentalID: { type: Boolean, default: false },
    shippingID: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Profile", profileSchema);
