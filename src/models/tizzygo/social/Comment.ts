import mongoose, { Schema, Document, Types } from "mongoose";

// ✅ Reply Interface (Subdocument)
export interface IReply extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  content: string;
  likes: Types.ObjectId[];
  reported: boolean;
  reportReason?: string;
}

// ✅ Reply Schema
const ReplySchema = new Schema<IReply>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
    reported: { type: Boolean, default: false },
    reportReason: { type: String },
  },
  { timestamps: true }
);

// ✅ Comment Interface
export interface IComment extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  postId: Types.ObjectId;
  content: string;
  likes: Types.ObjectId[];
  replies: mongoose.Types.DocumentArray<IReply>; // ✅ Important for .id() method
  reported: boolean;
  reportReason?: string;
}

// ✅ Comment Schema
const CommentSchema = new Schema<IComment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    postId: { type: Schema.Types.ObjectId, required: true },
    content: { type: String, required: true },
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
    replies: [ReplySchema], // ✅ Embedded replies
    reported: { type: Boolean, default: false },
    reportReason: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IComment>("Comment", CommentSchema);
