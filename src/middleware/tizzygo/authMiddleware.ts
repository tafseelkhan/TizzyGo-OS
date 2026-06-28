import { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import TizzyGoUser from "../../models/tizzygo/auths/User"; // app/user model

dotenv.config();

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "23ebd585-0ff0-4750-8fd7-76bd88b57dbf8bf28ac1-a29a-43ad-b481-2c20ae04b455";

export interface AuthRequest extends Request {
  seller?: any; // seller info attach karenge
  user?: any; // app/user info attach karenge
  roles?: string;
  userId?: string;
}

const authMiddleware: RequestHandler = async (req: AuthRequest, res, next) => {
  // ✅ Skip preflight OPTIONS request
  if (req.method === "OPTIONS") return next();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized: Token missing" });
  }

  const token = authHeader.split(" ")[1].replace(/^"|"$/g, "");

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    if (!decoded.userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: userId missing in token",
      });
    }
    // 🔹 Fetch app/user info from TizzyGo
    const appUser = await TizzyGoUser.findById(decoded.userId).exec();
    if (appUser) {
      req.user = {
        _id: appUser._id.toString(),
        id: appUser._id.toString(),
        userId: decoded.userId,
        roles: decoded.roles, // ✅ ADD THIS
      };
      req.userId = decoded.userId;
    }

    // ✅ At least one should exist
    if (!req.user) {
      return res.status(403).json({
        success: false,
        message: "Invalid token: User/Seller not found",
      });
    }

    next();
  } catch (err) {
    console.error("❌ Token verification failed:", err);
    return res
      .status(403)
      .json({ success: false, message: "Invalid or expired token" });
  }
};

export { authMiddleware };
