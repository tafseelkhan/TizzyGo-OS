import mongoose, { Schema } from "mongoose";

const SubcategorySchema = new Schema(
  {
    name: { type: String, required: true },

    specs: {
      type: [String],
      default: []
    },

    variantOptions: {
      type: [String],
      default: []
    }
  },
  { _id: true }
);

const CategorySchema = new Schema(
  {
    category: { type: String, required: true },

    subcategories: {
      type: [SubcategorySchema],
      default: []
    }
  },
  { timestamps: true }
);

export default mongoose.models.Category ||
  mongoose.model("Category", CategorySchema);
