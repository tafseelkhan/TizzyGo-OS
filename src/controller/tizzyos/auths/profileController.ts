import { Response } from "express";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import User from "../../../models/tizzyos/auths/User";
import { bucket } from "../../../firebase/firebase";

export const uploadBase64ToFirebase = async (base64: string, fileName: string) => {
  if (!base64) return null;

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

  return `https://storage.googleapis.com/${bucket.name}/${firebaseFileName}`;
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(400).json({ message: "Missing userId" });

    const { name, email, phone, image, fileName } = req.body;
console.log("🔵 BODY RECEIVED:", req.body);

    let profileImageUrl;

    // Only upload if new image is base64
    if (image && image.startsWith("data:image") && fileName) {
      profileImageUrl = await uploadBase64ToFirebase(image, fileName);
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          name,
          email,
          phone,
          ...(profileImageUrl && { image: profileImageUrl }),
        },
      },
      { new: true, runValidators: true }
    );
console.log("🔥 RECEIVED IMAGE:", image);
console.log("🔥 RECEIVED FILENAME:", fileName);
    if (!updatedUser)
      return res.status(404).json({ message: "User not found" });

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

// 🧾 Get user profile
export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(400).json({ message: "Missing userId" });

    const profile = await User.findById(userId).select("-__v");
    if (!profile) return res.status(404).json({ message: "Profile not found" });

    res.status(200).json(profile); // profile.image already Firebase public URL
  } catch (err) {
    console.error("❌ Get profile error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
