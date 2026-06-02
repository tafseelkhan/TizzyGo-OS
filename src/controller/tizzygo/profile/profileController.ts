import { Request, Response } from "express";
import path from "path";
import mongoose from "mongoose";
import fs from "fs";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import { bucket } from "../../../firebase/firebase";
import User from "../../../models/tizzygo/auths/User";

const SERVER_URL = process.env.SERVER_URL || "https://www.tizzygo.com";

export interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    id: string;
    userId: string;
    email?: string;
  };
  userId?: string;
}

interface IUser {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  image?: string;
}

// Extract file path from Firebase URL
export const extractFilePathFromUrl = (imageUrl: string): string | null => {
  try {
    // URL format: https://storage.googleapis.com/BUCKET_NAME/profiles/1234567890_filename.jpg
    const urlPattern = /https:\/\/storage\.googleapis\.com\/[^/]+\/(.+)$/;
    const match = imageUrl.match(urlPattern);

    if (match && match[1]) {
      return match[1];
    }

    // Alternative format: https://firebasestorage.googleapis.com/v0/b/BUCKET/o/profiles%2Ffilename.jpg?alt=media
    const altPattern = /\/o\/(.+?)\?/;
    const altMatch = imageUrl.match(altPattern);
    if (altMatch && altMatch[1]) {
      return decodeURIComponent(altMatch[1]);
    }

    return null;
  } catch (error) {
    console.error("Error extracting path:", error);
    return null;
  }
};

// Delete image from Firebase Storage
export const deleteFromFirebase = async (
  imageUrl: string,
): Promise<boolean> => {
  try {
    if (!imageUrl) {
      console.log("No image URL provided, skipping delete");
      return false;
    }

    const filePath = extractFilePathFromUrl(imageUrl);
    if (!filePath) {
      console.log("Could not extract file path from URL:", imageUrl);
      return false;
    }

    const file = bucket.file(filePath);
    const [exists] = await file.exists();

    if (exists) {
      await file.delete();
      console.log("✅ Old image deleted from Firebase:", filePath);
      return true;
    } else {
      console.log("File does not exist, skipping delete:", filePath);
      return false;
    }
  } catch (error) {
    console.error("Error deleting from Firebase:", error);
    return false;
  }
};

// Upload base64 image to Firebase
export const uploadBase64ToFirebase = async (
  base64: string,
  fileName: string,
): Promise<string | null> => {
  if (!base64) return null;

  try {
    // Remove prefix "data:image/jpeg;base64,"
    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");

    const firebaseFileName = `profiles/${Date.now()}_${fileName}`;
    const file = bucket.file(firebaseFileName);

    await file.save(buffer, {
      contentType: "image/jpeg",
      public: true,
    });

    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${firebaseFileName}`;
    console.log("✅ New image uploaded to Firebase:", publicUrl);

    return publicUrl;
  } catch (error) {
    console.error("Error uploading to Firebase:", error);
    return null;
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(400).json({ message: "Missing userId" });
    }

    const { name, email, phone, image, fileName } = req.body;
    console.log("🔵 BODY RECEIVED:", {
      name,
      email,
      phone,
      hasImage: !!image,
      fileName,
    });

    // Find existing user
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    let profileImageUrl = existingUser.image; // Keep old image by default

    // ✅ If new image is base64, delete old and upload new
    if (image && image.startsWith("data:image") && fileName) {
      console.log("🖼️ New image received, processing...");

      // Step 1: Delete old image from Firebase (if exists)
      if (existingUser.image) {
        console.log("🗑️ Deleting old image from Firebase...");
        await deleteFromFirebase(existingUser.image);
      }

      // Step 2: Upload new image to Firebase
      console.log("📤 Uploading new image to Firebase...");
      const newImageUrl = await uploadBase64ToFirebase(image, fileName);

      if (newImageUrl) {
        profileImageUrl = newImageUrl;
        console.log("✅ New image uploaded successfully:", newImageUrl);
      } else {
        console.log("⚠️ Failed to upload new image, keeping old image");
      }
    }

    // Update user in database
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          name: name || existingUser.name,
          email: email || existingUser.email,
          phone: phone || existingUser.phone,
          image: profileImageUrl,
        },
      },
      { new: true, runValidators: true },
    );

    console.log("✅ Profile updated successfully for user:", userId);

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (err) {
    console.error("🔥 Update error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// controllers/profileController.ts (add this function)

export const deleteProfileImage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(400).json({ message: "Missing userId" });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user has an image
    if (!user.image) {
      return res.status(404).json({ message: "No profile image found" });
    }

    // Delete image from Firebase Storage
    console.log("🗑️ Deleting profile image from Firebase...");
    const deleted = await deleteFromFirebase(user.image);

    if (deleted) {
      console.log("✅ Image deleted from Firebase");
    } else {
      console.log("⚠️ Image not found in Firebase or delete failed");
    }

    // Remove image reference from database
    user.image = "";
    await user.save();

    console.log("✅ Profile image removed from database for user:", userId);

    res.status(200).json({
      success: true,
      message: "Profile image deleted successfully",
    });
  } catch (err) {
    console.error("🔥 Delete image error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// 🔐 Get logged-in user's profile
export const getProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.user?.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Valid userId required" });
    }

    const user = await User.findById(id).lean<IUser>();
    if (!user) return res.status(404).json({ message: "User not found" });

    const image =
      user.image && !user.image.startsWith("http")
        ? `${SERVER_URL}${user.image}`
        : user.image || `${SERVER_URL}/images/default-profile.png`;

    res.json({
      userId: user._id,
      name: user.name || "No name",
      email: user.email || "Not provided",
      phone: user.phone || "Not provided",
      image,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// 👥 Get multiple users by IDs
export const getUsersByIds = async (req: Request, res: Response) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "Invalid or empty userIds array" });
    }

    const users = await User.find({ _id: { $in: userIds } }).select("name image");

    res.status(200).json(
      users.map((user) => ({
        _id: user._id.toString(),
        name: user.name || "Unknown",
        image: user.image || "/images/default-profile.png",
      }))
    );
  } catch (err: any) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Error fetching users", error: err?.message || err });
  }
};
