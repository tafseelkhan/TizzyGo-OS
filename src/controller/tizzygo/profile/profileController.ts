import { Request, Response } from "express";
import path from "path";
import mongoose from "mongoose";
import fs from "fs";
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

// 🔐 Update logged-in user's profile
export const updateProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.user?.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Valid userId required" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { name, email, phone } = req.body;

    if (email && email !== user.email) {
      const exists = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: id },
      });
      if (exists) return res.status(400).json({ message: "Email already in use" });
      user.email = email.toLowerCase().trim();
      user.isEmailVerified = false;
    }

    if (phone && phone !== user.phone) {
      const exists = await User.findOne({
        phone: phone.trim(),
        _id: { $ne: id },
      });
      if (exists) return res.status(400).json({ message: "Phone already in use" });
      user.phone = phone.trim();
      user.isPhoneVerified = false;
    }

    if (name) user.name = name.trim();

    // 🖼 Replace profile image
    if ((req as any).file) {
      if (user.image && user.image.includes("/uploads/")) {
        const oldPath = path.join(process.cwd(), user.image.replace(/^\//, ""));
        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
          } catch {
            /* ignore */
          }
        }
      }
      const rel = path.relative(process.cwd(), (req as any).file.path).replace(/\\/g, "/");
      user.image = `/${rel.startsWith("/") ? rel.slice(1) : rel}`;
    }

    await user.save();

    const image =
      user.image && !user.image.startsWith("http")
        ? `${SERVER_URL}${user.image}`
        : user.image || `${SERVER_URL}/images/default-profile.png`;

    res.json({
      message: "Profile updated",
      userId: user._id,
      name: user.name,
      email: user.email || "Not provided",
      phone: user.phone || "Not provided",
      image,
    });
  } catch (err: any) {
    console.error(err);
    if (err.code === 11000)
      return res.status(400).json({ message: "Duplicate field value" });
    res.status(500).json({ message: "Server error" });
  }
};

// 🌍 Get public profile by Mongo _id
export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const id = req.params.userId;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Valid userId required" });
    }

    const user = await User.findById(id).lean<IUser>();
    if (!user) return res.status(404).json({ message: "User not found" });

    const imageUrl = user.image
      ? user.image.startsWith("/") ? `${SERVER_URL}${user.image}` : user.image
      : `${SERVER_URL}/images/default-profile.png`;

    res.status(200).json({
      userId: String(user._id),
      name: user.name || "No name",
      email: user.email || "Not provided",
      phone: user.phone || "Not provided",
      image: imageUrl,
    });
  } catch (err: any) {
    res.status(500).json({
      message: "Error fetching profile",
      error: err?.message || err,
    });
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
