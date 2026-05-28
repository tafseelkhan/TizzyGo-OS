import { Request, Response } from "express";
import User from "../../../models/tizzygo/auths/User";
import Otp from "../../../models/tizzygo/auths/Otp";
import jwt from "jsonwebtoken";
import sendEmail from "../../../utils/tizzygo/sendEmail";
import sendSMS from "../../../utils/tizzygo/sendSMS";
import generateOTP from "../../../utils/tizzygo/generateOTP";
import { AuthRequest } from "../../../types/tizzygo/auth";

// Helper: Send OTP
const sendOtpHelper = async (identifier: string, otp: string) => {
  if (identifier.includes("@")) {
    console.log(`📩 Sending OTP to email: ${identifier}`);
    await sendEmail(identifier, otp);
  } else {
    console.log(`📱 Sending OTP to phone: ${identifier}`);
    await sendSMS(identifier, otp);
  }
};

// ======================== SIGNUP ========================

export const sendSignupOtp = async (req: Request, res: Response) => {
  try {
    let { identifier } = req.body;
    console.log("📥 Signup OTP Request:", identifier);

    if (!identifier) return res.status(400).json({ msg: "Email or Phone is required" });
    identifier = identifier.toLowerCase();

    const existing = await User.findOne({
      $or: [{ email: identifier }, { phone: identifier }],
    });

    if (existing) return res.status(409).json({ msg: "User already exists" });

    const otp = await generateOTP(identifier);
    await sendOtpHelper(identifier, otp);

    return res.json({ msg: `OTP sent to ${identifier}`, identifier });
  } catch (err) {
    console.error("❌ Signup OTP Error:", err);
    return res.status(500).json({ msg: "Something went wrong" });
  }
};

export const verifySignup = async (req: Request, res: Response) => {
  try {
    let { identifier, otp, name } = req.body;
    console.log("📥 Verify Signup:", { identifier, otp, name });

    if (!identifier || !otp || !name)
      return res.status(400).json({ msg: "All fields are required" });

    identifier = identifier.toLowerCase();

    const record = await Otp.findOne({ identifier });
    const now = Date.now();

    if (!record || record.otp !== otp || new Date(record.expiresAt).getTime() < now) {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    const userData: any = { name };
    if (identifier.includes("@")) {
      userData.email = identifier;
      userData.isEmailVerified = true;
    } else {
      userData.phone = identifier;
      userData.isPhoneVerified = true;
    }

    const newUser = await User.create(userData);
    await Otp.deleteOne({ identifier });

    console.log("✅ New User Created:", newUser);

    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET!, {
      expiresIn: "90d",
    });

    return res.json({
      msg: "Signup successful",
      token,
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
      },
    });
  } catch (err: any) {
    console.error("❌ Signup verify error:", err);
    if (err.code === 11000) {
      return res.status(409).json({ msg: "Duplicate email or phone number" });
    }
    return res.status(500).json({ msg: "Something went wrong" });
  }
};

// ======================== LOGIN ========================

export const sendLoginOtp = async (req: Request, res: Response) => {
  try {
    let { identifier } = req.body;
    console.log("📥 Login OTP Request:", identifier);

    if (!identifier) return res.status(400).json({ msg: "Email or Phone is required" });
    identifier = identifier.toLowerCase();

    const user = await User.findOne({
      $or: [{ email: new RegExp(`^${identifier}$`, "i") }, { phone: identifier }],
    });

    if (!user) return res.status(404).json({ msg: "User not found" });

    const otp = await generateOTP(identifier);
    await sendOtpHelper(identifier, otp);

    return res.json({ msg: `OTP sent to ${identifier}` });
  } catch (err) {
    console.error("❌ Login error:", err);
    return res.status(500).json({ msg: "Something went wrong" });
  }
};

export const verifyLogin = async (req: Request, res: Response) => {
  try {
    let { identifier, otp } = req.body;
    console.log("📥 Verify Login:", { identifier, otp });

    if (!identifier || !otp) return res.status(400).json({ msg: "All fields required" });
    identifier = identifier.toLowerCase();

    const record = await Otp.findOne({ identifier });
    const now = Date.now();

    if (!record || record.otp !== otp || new Date(record.expiresAt).getTime() < now) {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    const user = await User.findOne({
      $or: [{ email: new RegExp(`^${identifier}$`, "i") }, { phone: identifier }],
    });

    if (!user) return res.status(404).json({ msg: "User not found" });

    await Otp.deleteOne({ identifier });

    console.log("✅ Login Success for user:", user);

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    return res.json({
      msg: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("❌ Verify login error:", err);
    return res.status(500).json({ msg: "Something went wrong" });
  }
};

// ======================== RESEND OTP ========================

export const resendOtp = async (req: Request, res: Response) => {
  try {
    let { identifier } = req.body;
    console.log("🔁 Resend OTP for:", identifier);

    if (!identifier) return res.status(400).json({ msg: "Identifier required" });
    identifier = identifier.toLowerCase();

    const otp = await generateOTP(identifier);
    await sendOtpHelper(identifier, otp);

    return res.json({ msg: `New OTP sent to ${identifier}` });
  } catch (err) {
    console.error("❌ Resend OTP error:", err);
    return res.status(500).json({ msg: "Something went wrong" });
  }
};

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "23ebd585-0ff0-4750-8fd7-76bd88b57dbf8bf28ac1-a29a-43ad-b481-2c20ae04b455";

export const checkAuth = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("❌ No Bearer token found");
      return res
        .status(401)
        .json({ authenticated: false, message: "Token missing" });
    }

    const token = authHeader.split(" ")[1];
    console.log("📦 Token received:", token);

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    console.log("🔓 Decoded Token:", decoded);

    const user = await User.findById(decoded.userId);
    if (!user) {
      console.log("🚫 User not found in database:", decoded.userId);
      return res
        .status(401)
        .json({ authenticated: false, message: "User not authenticated" });
    }

    console.log("✅ User verified:", user.email);
    return res.json({
      authenticated: true,
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error: any) {
    console.error("❌ Token check failed:", error.message);
    return res.status(403).json({
      authenticated: false,
      message: "Invalid or expired token",
    });
  }
};