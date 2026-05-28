import { Request, Response } from "express";
import mongoose from "mongoose";
import Share from "../../../models/tizzygo/social/Share";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware"; // AuthRequest contains req.user

// Add a share (FINAL)
export const addShare = async (req: AuthRequest, res: Response) => {
  try {
    console.log("💡 addShare called with body:", req.body);
    console.log("👤 Authenticated user:", req.user);

    // Extract userId from token
    const userId = req.user?.id;
    const { productId, publicId, productType, platform } = req.body;

    if (!productId || !productType || !platform) {
      console.warn("⚠️ Missing required fields", req.body);
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.warn("⚠️ Invalid userId from token:", userId);
      return res.status(401).json({ message: "Invalid user" });
    }

    const finalPublicId = publicId || productId;

    console.log("🔹 Creating/updating share for productId:", productId, "platform:", platform);

    const share = await Share.findOneAndUpdate(
      { userId, productId, platform },
      {
        $setOnInsert: {
          userId,
          productId,
          publicId: finalPublicId,
          productType,
          platform,
        },
      },
      { upsert: true, new: true }
    );

    console.log("✅ Share saved:", share._id);

    res.status(200).json({ message: "Share recorded", share });
  } catch (err) {
    console.error("❌ Error adding share:", err);
    res.status(500).json({ message: "Error adding share", error: err });
  }
};

// Get stats
export const getShareStats = async (req: Request, res: Response) => {
  try {
    console.log("💡 getShareStats called for productId:", req.params.productId);

    const { productId } = req.params;
    if (!productId) {
      console.warn("⚠️ Missing productId in params");
      return res.status(400).json({ message: "Missing productId" });
    }

    const shares = await Share.aggregate([
      { $match: { publicId: productId } },
      { $group: { _id: "$platform", count: { $sum: 1 } } },
    ]);

    const totalShares = shares.reduce((sum, s) => sum + s.count, 0);

    console.log(`📊 Share stats for ${productId}: total=${totalShares}`, shares);

    res.status(200).json({ totalShares, breakdown: shares });
  } catch (err) {
    console.error("❌ Error fetching share stats:", err);
    res.status(500).json({ message: "Error fetching stats", error: err });
  }
};
