
import { Router } from "express";

import {
  signup,
  verifyPhone,
  login,
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

// Login with username or Connect address and password.
router.post("/login", login);

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
