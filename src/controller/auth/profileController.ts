// controllers/auth/profileController.ts

import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";

import {
  updateBasicProfile,
  updateAppRole,
  requestRecoveryConnectUpdate,
  verifyRecoveryConnectUpdate,
  requestPhoneChangeOTP,
  verifyPhoneChangeOTP,
} from "../../services/auth/profileService";

// ============================================================
// 1. UPDATE BASIC PROFILE
// ============================================================

export async function updateProfileController(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const result = await updateBasicProfile(req.userId, req.body ?? {});

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: result,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(400).json({
      success: false,
      message:
        error instanceof Error ? error.message : "Unable to update profile",
    });
  }
}

// ============================================================
// 2. UPDATE APP-ROLE
// ============================================================

export async function updateAppRoleController(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { app, role } = req.body ?? {};

    if (typeof app !== "string" || typeof role !== "string") {
      return res.status(400).json({
        success: false,
        message: "app and role are required",
      });
    }

    const result = await updateAppRole(req.userId, app, role);

    return res.status(200).json({
      success: true,
      message: "App role updated successfully",
      ...result,
    });
  } catch (error) {
    console.error("Update app role error:", error);
    return res.status(400).json({
      success: false,
      message:
        error instanceof Error ? error.message : "Unable to update app role",
    });
  }
}

// ============================================================
// 3. REQUEST RECOVERY CONNECT UPDATE
// ============================================================

export async function requestRecoveryConnectController(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { recoveryConnect } = req.body ?? {};
    if (typeof recoveryConnect !== "string") {
      return res.status(400).json({
        success: false,
        message: "recoveryConnect is required",
      });
    }

    const result = await requestRecoveryConnectUpdate(
      req.userId,
      recoveryConnect,
    );

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Request recovery connect error:", error);
    return res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to start recovery update",
    });
  }
}

// ============================================================
// 3b. VERIFY RECOVERY CONNECT OTP
// ============================================================

export async function verifyRecoveryConnectController(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { verificationId, code } = req.body ?? {};
    if (typeof verificationId !== "string" || typeof code !== "string") {
      return res.status(400).json({
        success: false,
        message: "verificationId and code are required",
      });
    }

    const result = await verifyRecoveryConnectUpdate(
      req.userId,
      verificationId,
      code,
    );

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Verify recovery connect error:", error);
    return res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to verify recovery update",
    });
  }
}

// ============================================================
// 4. REQUEST PHONE CHANGE OTP
// ============================================================

export async function requestPhoneChangeController(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { phone } = req.body ?? {};
    if (typeof phone !== "string") {
      return res.status(400).json({
        success: false,
        message: "phone is required",
      });
    }

    const result = await requestPhoneChangeOTP(req.userId, phone);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Request phone change error:", error);
    return res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to request phone change",
    });
  }
}

// ============================================================
// 5. VERIFY PHONE CHANGE OTP
// ============================================================

export async function verifyPhoneChangeController(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { phone, verificationId, code } = req.body ?? {};
    if (
      typeof phone !== "string" ||
      typeof verificationId !== "string" ||
      typeof code !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "phone, verificationId and code are required",
      });
    }

    const result = await verifyPhoneChangeOTP(
      req.userId,
      phone,
      verificationId,
      code,
    );

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Verify phone change error:", error);
    return res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to verify phone change",
    });
  }
}