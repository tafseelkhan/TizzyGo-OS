import { Request, Response } from "express";
import Category from "../../models/tizzyos/category";

export const getAllCategories = async (req: Request, res: Response) => {
  try {
    const categories = await Category.find().sort({ category: 1 });
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ success: false, message: "Server Error", error });
  }
};
