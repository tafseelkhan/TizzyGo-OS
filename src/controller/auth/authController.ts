import crypto from "crypto";
import type { Request, Response } from "express";

import {
  createUser,
  verifyPhoneSignup,
  loginUser,
  logoutUser,
  getCurrentUser,
  refreshAccessToken,
  setUserAppRoles,
  removeUserApp,
} from "../../services/auth/userService";

import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import type { AppName, AppRole } from "../../models/auth/User";

const APP_NAMES: readonly AppName[] = ["TIZZYGO", "TIZZYOS"];

function isAppName(value: unknown): value is AppName {
  return (
    typeof value === "string" &&
    APP_NAMES.includes(value as AppName)
  );
}

/**
 * SIGNUP — STEP 1
 * Save temporary signup details and send SMS OTP.
 * No access or session token is issued at this step.
 */
export async function signup(req: Request, res: Response) {
  try {
    const {
      firstName,
      lastName,
      username,
      password,
      confirmPassword,
      phone,
      termsAccepted,
      deviceName,
    } = req.body ?? {};

    const result = await createUser({
      firstName,
      lastName,
      username,
      password,
      confirmPassword,
      phone,
      termsAccepted,
      deviceName:
        typeof deviceName === "string" ? deviceName : undefined,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(201).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Signup error:", error);

    return res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to start signup",
    });
  }
}

/**
 * VERIFY PHONE — STEP 2
 * Verify Twilio SMS OTP, create the permanent account,
 * and issue tokens.
 */
export async function verifyPhone(req: Request, res: Response) {
  try {
    const { verificationId, code } = req.body ?? {};

    if (
      typeof verificationId !== "string" ||
      typeof code !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Verification ID and 6-digit OTP are required",
      });
    }

    const result = await verifyPhoneSignup(verificationId, code);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Phone verification error:", error);

    return res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to verify phone number",
    });
  }
}

/**
 * LOGIN
 * Global Connect role comes from the stored user record.
 * App associations are returned by the service.
 */
export async function login(req: Request, res: Response) {
  try {
    const { login: loginValue, password, deviceName } = req.body ?? {};

    if (
      typeof loginValue !== "string" ||
      typeof password !== "string" ||
      !loginValue.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Login and password are required",
      });
    }

    const result = await loginUser({
      login: loginValue,
      password,
      deviceName:
        typeof deviceName === "string" ? deviceName : undefined,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      accessToken: result.accessToken,
      sessionToken: result.sessionToken,
      user: result.user,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(401).json({
      success: false,
      message:
        error instanceof Error ? error.message : "Unable to login",
    });
  }
}

/**
 * GET CURRENT USER
 * Requires authMiddleware.
 * The service response includes optional apps and their roles.
 */
export async function me(
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

    const user = await getCurrentUser(req.userId);

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get current user error:", error);

    return res.status(404).json({
      success: false,
      message:
        error instanceof Error ? error.message : "User not found",
    });
  }
}

/**
 * REFRESH ACCESS TOKEN
 * Requires a valid x-session-token header.
 */
export async function refresh(req: Request, res: Response) {
  try {
    const sessionToken = req.headers["x-session-token"];

    if (
      typeof sessionToken !== "string" ||
      !sessionToken.trim()
    ) {
      return res.status(401).json({
        success: false,
        message: "Session token is required",
      });
    }

    const result = await refreshAccessToken(sessionToken);

    return res.status(200).json({
      success: true,
      message: "Access token refreshed successfully.",
      accessToken: result.accessToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);

    return res.status(401).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to refresh access token",
    });
  }
}

/**
 * LOGOUT
 * Requires authMiddleware and the matching session token.
 *
 * ✅ FIX: If the session token is already missing (e.g. user already
 * logged out or session expired), return success instead of 400.
 * This matches the frontend behaviour where `x-session-token` is
 * optional on logout.
 */
export async function logout(
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

    const sessionToken = req.headers["x-session-token"];

    // ✅ Already logged out — no session to revoke.
    if (
      typeof sessionToken !== "string" ||
      !sessionToken.trim()
    ) {
      return res.status(200).json({
        success: true,
        message: "Already logged out",
      });
    }

    const sessionTokenHash = crypto
      .createHash("sha256")
      .update(sessionToken)
      .digest("hex");

    const result = await logoutUser(req.userId, sessionTokenHash);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Logout error:", error);

    return res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to logout",
    });
  }
}

/**
 * SET APP ROLES
 *
 * IMPORTANT:
 * Protect this endpoint with authentication AND admin authorization.
 * Never expose it as a public route.
 */
export async function updateUserAppRoles(
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

    const { userId, app, roles } = req.body ?? {};

    if (typeof userId !== "string" || !userId.trim()) {
      return res.status(400).json({
        success: false,
        message: "Target user ID is required",
      });
    }

    if (!isAppName(app)) {
      return res.status(400).json({
        success: false,
        message: "App must be TIZZYGO or TIZZYOS",
      });
    }

    if (
      !Array.isArray(roles) ||
      !roles.every((role: unknown) => typeof role === "string")
    ) {
      return res.status(400).json({
        success: false,
        message: "Roles must be an array of strings",
      });
    }

    const result = await setUserAppRoles(
      userId,
      app,
      roles as AppRole[],
    );

    return res.status(200).json({
      success: true,
      message: "App roles updated successfully",
      ...result,
    });
  } catch (error) {
    console.error("Update app roles error:", error);

    return res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to update app roles",
    });
  }
}

/**
 * REMOVE APP ASSOCIATION
 *
 * Protect this endpoint with admin authorization too.
 */
export async function deleteUserApp(
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

    const { userId, app } = req.body ?? {};

    if (typeof userId !== "string" || !userId.trim()) {
      return res.status(400).json({
        success: false,
        message: "Target user ID is required",
      });
    }

    if (!isAppName(app)) {
      return res.status(400).json({
        success: false,
        message: "App must be TIZZYGO or TIZZYOS",
      });
    }

    const result = await removeUserApp(userId, app);

    return res.status(200).json({
      success: true,
      message: "App association removed successfully",
      ...result,
    });
  } catch (error) {
    console.error("Remove app association error:", error);

    return res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to remove app association",
    });
  }
}