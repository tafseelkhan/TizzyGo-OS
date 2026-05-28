// import mongoose, { Schema, Document } from "mongoose";

// export interface ISeller extends Document {
//   name: string;
//   email: string;
//   stripeAccountId: string;
//   payoutMode: "automatic" | "manual";
//   payoutVerified: boolean;
// }

// const SellerSchema: Schema = new Schema({
//   name: { type: String, required: true },
//   email: { type: String, required: true, unique: true },
//   stripeAccountId: { type: String, required: true },
//   payoutMode: { type: String, enum: ["automatic", "manual"], default: "automatic" },
//   payoutVerified: { type: Boolean, default: false },
// });

// export default mongoose.model<ISeller>("Seller", SellerSchema);
