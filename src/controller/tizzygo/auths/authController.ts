// controllers/authController.ts
import { Request, Response } from "express";
import User from "../../../models/tizzygo/auths/User";
import Otp from "../../../models/tizzygo/auths/Otp";
import jwt from "jsonwebtoken";
import { LinkedAccountService } from "../../../services/tizzygo/LinkedAccountService";

// =============================================
// ✅ IMPORT UTILITY FUNCTIONS
// =============================================

// Import these from your existing utility files
import sendEmail from "../../../utils/tizzygo/sendEmail";
import sendSMS from "../../../utils/tizzygo/sendSMS";
import generateOTP from "../../../utils/tizzygo/generateOTP";

// Helper: Send OTP
const sendOtpHelper = async (identifier: string, otp: string) => {
  if (identifier.includes("@")) {
    console.log(`📩 Sending OTP to email: ${identifier}`);
    await sendEmail(identifier, otp);
    console.log("your otp is:", otp);
  } else {
    console.log(`📱 Sending OTP to phone: ${identifier}`);
    await sendSMS(identifier, otp);
  }
};

// =============================================
// ✅ RESEND OTP ENDPOINT
// =============================================

export const resendOtp = async (req: Request, res: Response) => {
  try {
    let { identifier } = req.body;
    console.log("🔁 Resend OTP for:", identifier);

    if (!identifier) {
      return res.status(400).json({ msg: "Identifier required" });
    }
    identifier = identifier.toLowerCase();

    const otp = await generateOTP(identifier);
    await sendOtpHelper(identifier, otp);

    return res.json({ msg: `New OTP sent to ${identifier}` });
  } catch (err) {
    console.error("❌ Resend OTP error:", err);
    return res.status(500).json({ msg: "Something went wrong" });
  }
};

// =============================================
// ✅ CHECK AUTH ENDPOINT
// =============================================

export const checkAuth = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("❌ No Bearer token found");
      return res.status(401).json({
        authenticated: false,
        message: "Token missing",
      });
    }

    const token = authHeader.split(" ")[1];
    console.log("📦 Token received:", token);

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      roles: string;
    };
    console.log("🔓 Decoded Token:", decoded);

    const user = await User.findById(decoded.userId);
    if (!user) {
      console.log("🚫 User not found in database:", decoded.userId);
      return res.status(401).json({
        authenticated: false,
        message: "User not authenticated",
      });
    }

    // ✅ Get linked accounts
    const linkedAccounts = await LinkedAccountService.getLinkedAccounts(
      user._id.toString(),
    );

    console.log("✅ User verified:", user.email);
    return res.json({
      authenticated: true,
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.roles,
      },
      linkedAccounts: linkedAccounts.linkedAccounts,
    });
  } catch (error: any) {
    console.error("❌ Token check failed:", error.message);
    return res.status(403).json({
      authenticated: false,
      message: "Invalid or expired token",
    });
  }
};

// =============================================
// ✅ SIGNUP ENDPOINTS
// =============================================

export const sendSignupOtp = async (req: Request, res: Response) => {
  try {
    let { identifier } = req.body;
    console.log("📥 Signup OTP Request:", identifier);

    if (!identifier) {
      return res.status(400).json({ msg: "Email or Phone is required" });
    }
    identifier = identifier.toLowerCase();

    const existing = await User.findOne({
      $or: [{ email: identifier }, { phone: identifier }],
    });

    if (existing) {
      return res.status(409).json({ msg: "User already exists" });
    }

    const otp = await generateOTP(identifier);
    await sendOtpHelper(identifier, otp);
    console.log("otp is:", otp);
    return res.json({ msg: `OTP sent to ${identifier}`, identifier });
  } catch (err) {
    console.error("❌ Signup OTP Error:", err);
    return res.status(500).json({ msg: "Something went wrong" });
  }
};

export const verifySignup = async (req: Request, res: Response) => {
  try {
    let { identifier, otp, name, role } = req.body;
    console.log("📥 Verify Signup:", { identifier, otp, name, role });

    if (!identifier || !otp || !name) {
      return res.status(400).json({ msg: "All fields are required" });
    }

    identifier = identifier.toLowerCase();

    const record = await Otp.findOne({ identifier });
    const now = Date.now();

    if (
      !record ||
      record.otp !== otp ||
      new Date(record.expiresAt).getTime() < now
    ) {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    const userData: any = {
      name,
      role: role || "SELLER",
    };

    if (identifier.includes("@")) {
      userData.email = identifier;
      userData.isEmailVerified = true;
    } else {
      userData.phone = identifier;
      userData.isPhoneVerified = true;
    }

    const newUser = await User.create(userData);
    await Otp.deleteOne({ identifier });

    // ✅ Create account group for first user
    await LinkedAccountService.createAccountGroup(
      newUser._id.toString(),
      newUser.roles,
    );

    console.log("✅ New User Created with Account Group:", newUser);

    const token = jwt.sign(
      { userId: newUser._id, roles: newUser.roles },
      process.env.JWT_SECRET!,
      { expiresIn: "90d" },
    );

    // ✅ Get linked accounts
    const linkedAccounts = await LinkedAccountService.getLinkedAccounts(
      newUser._id.toString(),
    );

    return res.json({
      msg: "Signup successful",
      token,
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.roles,
      },
      linkedAccounts: linkedAccounts.linkedAccounts,
    });
  } catch (err: any) {
    console.error("❌ Signup verify error:", err);
    if (err.code === 11000) {
      return res.status(409).json({ msg: "Duplicate email or phone number" });
    }
    return res.status(500).json({ msg: "Something went wrong" });
  }
};

// =============================================
// ✅ LOGIN ENDPOINTS
// =============================================

export const sendLoginOtp = async (req: Request, res: Response) => {
  try {
    let { identifier } = req.body;
    console.log("📥 Login OTP Request:", identifier);

    if (!identifier) {
      return res.status(400).json({ msg: "Email or Phone is required" });
    }
    identifier = identifier.toLowerCase();

    const user = await User.findOne({
      $or: [
        { email: new RegExp(`^${identifier}$`, "i") },
        { phone: identifier },
      ],
    });

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

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

    if (!identifier || !otp) {
      return res.status(400).json({ msg: "All fields required" });
    }
    identifier = identifier.toLowerCase();

    const record = await Otp.findOne({ identifier });
    const now = Date.now();

    if (
      !record ||
      record.otp !== otp ||
      new Date(record.expiresAt).getTime() < now
    ) {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    const user = await User.findOne({
      $or: [
        { email: new RegExp(`^${identifier}$`, "i") },
        { phone: identifier },
      ],
    });

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    await Otp.deleteOne({ identifier });

    console.log("✅ Login Success for user:", user);

    const token = jwt.sign(
      { userId: user._id, roles: user.roles },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" },
    );

    // ✅ Get all linked accounts
    const linkedAccounts = await LinkedAccountService.getLinkedAccounts(
      user._id.toString(),
    );

    return res.json({
      msg: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.roles,
      },
      linkedAccounts: linkedAccounts.linkedAccounts,
    });
  } catch (err) {
    console.error("❌ Verify login error:", err);
    return res.status(500).json({ msg: "Something went wrong" });
  }
};

// =============================================
// ✅ ACCOUNT SWITCHING ENDPOINTS
// =============================================

export const switchAccount = async (req: Request, res: Response) => {
  try {
    console.log("=========================================");
    console.log("📡 SWITCH ACCOUNT API CALLED");
    console.log("=========================================");
    
    // ✅ Support both 'accountId' and 'targetUserId'
    const { accountId, targetUserId } = req.body;
    const currentUserId = (req as any).user.userId;
    
    console.log("🔑 Current User ID:", currentUserId);
    console.log("📦 Request Body:", req.body);
    console.log("🎯 Account ID:", accountId);
    console.log("🎯 Target User ID:", targetUserId);

    // ✅ Use accountId if provided, otherwise use targetUserId
    const finalTargetId = accountId || targetUserId;

    if (!finalTargetId) {
      console.log("❌ No target ID provided");
      return res.status(400).json({ 
        success: false,
        msg: "Account ID or Target User ID is required" 
      });
    }

    console.log(`🔄 Switching to target ID: ${finalTargetId}`);

    const result = await LinkedAccountService.switchAccount(
      currentUserId,
      finalTargetId,
    );

    console.log("✅ Switch successful:", {
      newRole: result.currentAccount?.roles,
      accountName: result.currentAccount?.name,
      totalAccounts: result.linkedAccounts?.length
    });
    console.log("=========================================");

    return res.json(result);
  } catch (err: any) {
    console.error("=========================================");
    console.error("❌ Switch account error:", err);
    console.error("❌ Error Stack:", err.stack);
    console.error("=========================================");
    
    return res.status(400).json({ 
      success: false,
      msg: err.message || "Failed to switch account" 
    });
  }
};

// controllers/authController.ts

/**
 * ✅ Double Tap Switch Account API
 * Randomly switches to any other linked account
 */
export const doubleTapSwitchAccount = async (req: Request, res: Response) => {
  try {
    console.log("=========================================");
    console.log("🔄 DOUBLE TAP SWITCH ACCOUNT API CALLED");
    console.log("=========================================");
    
    const currentUserId = (req as any).user.userId;
    console.log("🔑 Current User ID:", currentUserId);

    if (!currentUserId) {
      console.log("❌ User ID not found");
      return res.status(401).json({ 
        success: false,
        msg: "Unauthorized - User ID not found" 
      });
    }

    // ✅ Call service to get random account
    const result = await LinkedAccountService.getRandomLinkedAccount(currentUserId);
    
    console.log("✅ Random account selected:", {
      name: result.account?.name,
      roles: result.account?.roles
    });
    console.log("=========================================");

    return res.json({
      success: true,
      account: result.account,
      linkedAccounts: result.allAccounts,
      message: `Switched to ${result.account?.roles} account: ${result.account?.name}`,
      token: result.token // New token for the switched account
    });
  } catch (err: any) {
    console.error("=========================================");
    console.error("❌ Double tap switch error:", err);
    console.error("=========================================");
    
    return res.status(400).json({ 
      success: false,
      msg: err.message || "Failed to switch account" 
    });
  }
};

export const addLinkedAccount = async (req: Request, res: Response) => {
  try {
        const currentUserId = req.user?._id;
        console.log("🆔 User ID from token:", currentUserId);

        // ✅ Check if userId exists
        if (!currentUserId) {
          console.log("❌ User ID not found in request");
          return res.status(401).json({
            success: false,
            msg: "User ID not found",
          });
        }
    const { name, email, phone, roles } = req.body;

    if (!name || !roles) {
      return res.status(400).json({ msg: "Name and role are required" });
    }

    // Validate role
    const allowedRoles = ["SELLER", "FWS", "SHIPPING"];
    if (!allowedRoles.includes(roles)) {
      return res.status(400).json({
        msg: `Role must be one of: ${allowedRoles.join(", ")}`,
      });
    }

    const result = await LinkedAccountService.addLinkedAccount(currentUserId, {
      name,
      email,
      phone,
      roles,
    });

    return res.json(result);
  } catch (err: any) {
    console.error("❌ Add linked account error:", err);
    return res.status(400).json({ msg: err.message });
  }
};

export const getLinkedAccounts = async (req: Request, res: Response) => {
  try {
    console.log("=========================================");
    console.log("📡 GET LINKED ACCOUNTS API CALLED");
    console.log("=========================================");

    // ✅ Full request details
    console.log("🔍 Request Headers:", {
      authorization: req.headers.authorization ? "Present" : "Missing",
      contentType: req.headers["content-type"],
      userAgent: req.headers["user-agent"],
    });

    console.log("👤 Request User Object:", req.user);

    const userId = req.user?._id;
    console.log("🆔 User ID from token:", userId);

    // ✅ Check if userId exists
    if (!userId) {
      console.log("❌ User ID not found in request");
      return res.status(401).json({
        success: false,
        msg: "User ID not found",
      });
    }

    console.log("✅ User ID validated, fetching linked accounts...");

    // ✅ Service call with logging
    const result = await LinkedAccountService.getLinkedAccounts(userId);

    // ✅ Log the result before sending
    console.log("📊 Service Response:", {
      success: result.success,
      count: result.linkedAccounts?.length || 0,
      accounts: JSON.stringify(result.linkedAccounts, null, 2),
    });

    console.log("✅ Sending response to frontend");
    console.log("=========================================");

    return res.json(result);
  } catch (err: any) {
    console.error("=========================================");
    console.error("❌ GET LINKED ACCOUNTS ERROR:", err);
    console.error("❌ Error Stack:", err.stack);
    console.error("❌ Error Message:", err.message);
    console.error("=========================================");

    return res.status(400).json({
      success: false,
      msg: err.message || "Failed to fetch linked accounts",
      error: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};

export const removeLinkedAccount = async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).user.userId;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ msg: "Target user ID is required" });
    }

    const result = await LinkedAccountService.removeLinkedAccount(
      currentUserId,
      targetUserId,
    );

    return res.json(result);
  } catch (err: any) {
    console.error("❌ Remove linked account error:", err);
    return res.status(400).json({ msg: err.message });
  }
};
