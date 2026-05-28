import mongoose, { Schema, Document } from "mongoose";

export interface IStory extends Document {
  user: {
    _id: string;
    fullname: string;
    profileImage: string;
  };
  product: any;
  category: "mobile" | "car" | "property";
  createdAt: Date;
}

const storySchema = new Schema<IStory>(
  {
    user: {
      _id: { type: String, required: true },
      fullname: { type: String, required: true },
      profileImage: { type: String, required: true },
    },
    product: { type: Schema.Types.Mixed, required: true }, // store full product object
    category: { type: String, enum: ["mobile", "car", "property"], required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IStory>("Story", storySchema);
