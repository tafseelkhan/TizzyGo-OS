import { Router } from "express";

import {
  signup,
  verifyPhone,
  login,
  verifyLogin,
  forgotPassword,
  verifyForgotPassword,
  resetPasswordHandler,
  resendOtpHandler,
  me,
  logout,
  refresh,
} from "../../controller/auth/authController";

import { authMiddleware } from "../../middleware/authMiddleware";

const router = Router();

/**
 * PUBLIC AUTH ROUTES
 */

// Step 1: Submit signup details and send SMS OTP.
router.post("/signup", signup);

// Step 2: Verify SMS OTP and create the permanent account.
router.post("/verify-phone", verifyPhone);

// Login Step 1: Validate password and send login OTP.
router.post("/login", login);

// Login Step 2: Verify login OTP and receive tokens.
router.post("/login/verify-otp", verifyLogin);

// Forgot Password Step 1: Request OTP using username / connectAddress.
router.post("/forgot-password", forgotPassword);

// Forgot Password Step 2: Verify OTP → receive short-lived reset token.
router.post("/forgot-password/verify-otp", verifyForgotPassword);

// Forgot Password Step 3: Submit reset token + new password.
router.post("/forgot-password/reset", resetPasswordHandler);

// Resend OTP (signup / login / forgot-password).
// Purpose is determined from the stored verification record.
router.post("/resend-otp", resendOtpHandler);

// Exchange a valid session token for a new access token.
router.post("/refresh", refresh);

/**
 * PROTECTED AUTH ROUTES
 */

// Get the currently authenticated user's profile.
router.get("/me", authMiddleware, me);

// Revoke the current session.
router.post("/logout", authMiddleware, logout);

export default router;
