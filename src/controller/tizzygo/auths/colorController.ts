import { Request, Response } from "express";
import User from "../../../models/tizzygo/auths/User";

// Extend Express Request type globally
declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        [key: string]: any;
      };
    }
  }
}

// Private API - Save user's favorite color
export const saveUserColor = async (req: Request, res: Response) => {
  console.log("📝 [saveUserColor] Function called");
  console.log("📝 [saveUserColor] Request body:", req.body);
  console.log("📝 [saveUserColor] Auth user:", req.user);

  try {
    // Get userId from auth middleware instead of request body
    const userId = req.user?._id;
    const { color } = req.body;

    console.log("🔍 [saveUserColor] Extracted userId:", userId);
    console.log("🔍 [saveUserColor] Extracted color:", color);

    // Validation
    if (!userId) {
      console.log("❌ [saveUserColor] Validation failed: No userId found");
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found in request",
      });
    }

    if (!color) {
      console.log("❌ [saveUserColor] Validation failed: No color provided");
      return res.status(400).json({
        success: false,
        message: "Color name is required",
      });
    }

    // Validate color name (only letters, spaces, and hyphens allowed)
    const colorRegex = /^[a-zA-Z\s-]+$/;
    if (!colorRegex.test(color)) {
      console.log(
        "❌ [saveUserColor] Validation failed: Invalid color format -",
        color,
      );
      return res.status(400).json({
        success: false,
        message: "Invalid color name. Use only letters, spaces, or hyphens",
      });
    }

    console.log("✅ [saveUserColor] Validation passed, updating user...");

    // Find user and update color
    const user = await User.findByIdAndUpdate(
      userId,
      { color: color.toUpperCase().trim() }, // Save in uppercase
      { new: true, runValidators: true },
    ).select("-__v");

    console.log(
      "🔍 [saveUserColor] Database update result:",
      user ? "User found and updated" : "User not found",
    );
    if (user) {
      console.log("📊 [saveUserColor] Updated user data:", {
        _id: user._id,
        name: user.name,
        color: user.color,
      });
    }

    if (!user) {
      console.log(
        "❌ [saveUserColor] User not found in database for userId:",
        userId,
      );
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log(
      "✅ [saveUserColor] Color saved successfully for user:",
      userId,
    );
    return res.status(200).json({
      success: true,
      message: "Color saved successfully",
      data: {
        userId: user._id,
        name: user.name,
        color: user.color,
      },
    });
  } catch (error: any) {
    console.error("💥 [saveUserColor] Error caught:", error);
    console.error("💥 [saveUserColor] Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Private API - Get user's favorite color
export const getUserColor = async (req: Request, res: Response) => {
  console.log("📖 [getUserColor] Function called");
  console.log("📖 [getUserColor] Auth user:", req.user);

  try {
    // Get userId from auth middleware instead of params
    const userId = req.user?._id;

    console.log("🔍 [getUserColor] Extracted userId:", userId);

    if (!userId) {
      console.log("❌ [getUserColor] Validation failed: No userId found");
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found in request",
      });
    }

    console.log("✅ [getUserColor] Validation passed, fetching user...");

    // Find user and get color
    const user = await User.findById(userId).select("name color");

    console.log(
      "🔍 [getUserColor] Database query result:",
      user ? "User found" : "User not found",
    );
    if (user) {
      console.log("📊 [getUserColor] User data:", {
        _id: user._id,
        name: user.name,
        color: user.color,
      });
    }

    if (!user) {
      console.log(
        "❌ [getUserColor] User not found in database for userId:",
        userId,
      );
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log(
      "✅ [getUserColor] Color retrieved successfully for user:",
      userId,
    );
    return res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        name: user.name,
        color: user.color || null, // Return null if no color is set
      },
    });
  } catch (error: any) {
    console.error("💥 [getUserColor] Error caught:", error);
    console.error("💥 [getUserColor] Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Private API - Update user's favorite color
export const updateUserColor = async (req: Request, res: Response) => {
  console.log("🔄 [updateUserColor] Function called");
  console.log("🔄 [updateUserColor] Request body:", req.body);
  console.log("🔄 [updateUserColor] Auth user:", req.user);

  try {
    // Get userId from auth middleware instead of params
    const userId = req.user?._id;
    const { color } = req.body;

    console.log("🔍 [updateUserColor] Extracted userId:", userId);
    console.log("🔍 [updateUserColor] Extracted color:", color);

    // Validation
    if (!userId) {
      console.log("❌ [updateUserColor] Validation failed: No userId found");
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found in request",
      });
    }

    if (!color) {
      console.log("❌ [updateUserColor] Validation failed: No color provided");
      return res.status(400).json({
        success: false,
        message: "Color name is required for update",
      });
    }

    // Validate color name (only letters, spaces, and hyphens allowed)
    const colorRegex = /^[a-zA-Z\s-]+$/;
    if (!colorRegex.test(color)) {
      console.log(
        "❌ [updateUserColor] Validation failed: Invalid color format -",
        color,
      );
      return res.status(400).json({
        success: false,
        message:
          "Invalid color name. Use only letters, spaces, or hyphens (e.g., TEAL, LIGHT BLUE, DARK-GREEN)",
      });
    }

    console.log("✅ [updateUserColor] Validation passed, updating user...");

    // Find user and update color
    const user = await User.findByIdAndUpdate(
      userId,
      { color: color.toUpperCase().trim() }, // Save in uppercase
      { new: true, runValidators: true },
    ).select("-__v");

    console.log(
      "🔍 [updateUserColor] Database update result:",
      user ? "User found and updated" : "User not found",
    );
    if (user) {
      console.log("📊 [updateUserColor] Updated user data:", {
        _id: user._id,
        name: user.name,
        color: user.color,
      });
    }

    if (!user) {
      console.log(
        "❌ [updateUserColor] User not found in database for userId:",
        userId,
      );
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log(
      "✅ [updateUserColor] Color updated successfully for user:",
      userId,
    );
    return res.status(200).json({
      success: true,
      message: "Color updated successfully",
      data: {
        userId: user._id,
        name: user.name,
        color: user.color,
      },
    });
  } catch (error: any) {
    console.error("💥 [updateUserColor] Error caught:", error);
    console.error("💥 [updateUserColor] Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
