import mongoose, { Schema, Document, Types } from "mongoose";

export interface ISearchLog extends Document {
  query: string;
  userId?: Types.ObjectId; // MongoDB _id of the user
  createdAt: Date;
}

const SearchLogSchema = new Schema<ISearchLog>(
  {
    query: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" }, // ✅ reference to User
  },
  { timestamps: true }
);

export default mongoose.model<ISearchLog>("SearchLog", SearchLogSchema);
