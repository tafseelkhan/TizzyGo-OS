import { Request, Response } from "express";
import Story from "../../../models/tizzyos/story/Story";
import { Product } from "../../../models/tizzyos/seller/AddProducts/Products"; // single model now
import User from "../../../models/tizzygo/auths/User"; // assume user model hai

export const createStory = async (req: Request, res: Response) => {

  // try {
  //   const { productId, category } = req.body;
  //   const userId = req.userId; // set by auth middleware

  //   if (!productId || !category) {
  //     return res.status(400).json({ message: "Missing fields" });
  //   }

  //   // 🔹 find user from Profile collection using foreign key 'user'
  //   const user = await User.findOne({ user: userId }).select("fullname profileImage");
  //   if (!user) {
  //     return res.status(404).json({ message: "User not found" });
  //   }

  //   // 🔹 save story
  //   const story = new Story({
  //     user: {
  //       _id: user._id,
  //       fullname: user.fullname,
  //       profileImage: user.profileImage,
  //     },
  //     product: await Product.findById(productId).lean(),
  //     category,
  //   });

  //   await story.save();

  //   return res.status(201).json({ message: "Story created", story });
  // } catch (err: any) {
  //   console.error("❌ Error creating story:", err);
  //   return res.status(500).json({ message: "Server error" });
  // }
};

export const getStories = async (req: Request, res: Response) => {
  // try {
  //   const stories = await Story.find().sort({ createdAt: -1 }).lean();
  //   return res.json({ stories }); // ✅ object ke andar stories
  // } catch (err: any) {
  //   console.error("Error fetching stories:", err);
  //   return res.status(500).json({ message: "Server error" });
  // }
};