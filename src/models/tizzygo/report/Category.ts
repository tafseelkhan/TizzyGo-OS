// src/models/Category.ts
import { Schema, model, Document } from "mongoose";

export interface ISubcategory {
  id: string;
  title: string;
  icon?: string; // optional icon name / url
}

export interface ICategory extends Document {
  title: string; // menu name
  icon?: string;
  subcategories: ISubcategory[];
}

const SubcategorySchema = new Schema<ISubcategory>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    icon: { type: String },
  },
  { _id: false }
);

const CategorySchema = new Schema<ICategory>(
  {
    title: { type: String, required: true },
    icon: { type: String },
    subcategories: { type: [SubcategorySchema], default: [] },
  },
  { timestamps: true }
);

export default model<ICategory>("Category", CategorySchema);
