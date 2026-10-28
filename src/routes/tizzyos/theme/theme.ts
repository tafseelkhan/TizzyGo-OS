import express from "express";
import { authMiddleware, AuthRequest } from "../../../middleware/authMiddleware";
import { getQutonConnectModels } from "../../../config/tizzygo/qutonConnectDatabase";

export const router = express.Router();

// ✅ Update theme
router.post(
  "/theme",
  authMiddleware,
  async (req: AuthRequest, res) => {
    console.log("🎨 Theme update request received");
    console.log("📦 Request body:", req.body);
    console.log("👤 User from request:", req.user);

    const { theme } = req.body;

    console.log("🎯 Theme to update:", theme);

    if (!["light", "dark", "system"].includes(theme)) {
      console.log("❌ Invalid theme provided:", theme);
      return res.status(400).json({ success: false, message: "Invalid theme" });
    }

    const userId = req.userId ?? req.user?._id;
    if (!userId) {
      console.log("❌ No user found in request");
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    console.log("🔄 Updating theme for user ID:", userId);

    try {
      const { User } = getQutonConnectModels();
      await User.findByIdAndUpdate(userId, { theme });
      console.log("✅ Theme updated successfully for user:", userId);

      return res.json({
        success: true,
        message: "Theme updated successfully",
        theme,
      });
    } catch (error) {
      console.log("❌ Error updating theme:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update theme",
      });
    }
  },
);

// ✅ Get theme
router.get(
  "/theme",
  authMiddleware,
  async (req: AuthRequest, res) => {
    console.log("🎨 Get theme request received");
    console.log("👤 User from request:", req.user);

    const userId = req.userId ?? req.user?._id;
    if (!userId) {
      console.log("❌ No user found in request");
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    console.log("🔍 Fetching theme for user ID:", userId);

    try {
      const { User } = getQutonConnectModels();
      const user = await User.findById(userId).select("theme");
      console.log("📊 User theme data:", user?.theme);

      const finalTheme = user?.theme || "system";
      console.log("✅ Returning theme:", finalTheme);

      return res.json({
        success: true,
        theme: finalTheme,
      });
    } catch (error) {
      console.log("❌ Error fetching theme:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch theme",
      });
    }
  },
);

export default router;