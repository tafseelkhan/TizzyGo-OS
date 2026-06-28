import express from "express";
import {
  sendSignupOtp,
  verifySignup,
  sendLoginOtp,
  verifyLogin,
  resendOtp,
  checkAuth,
  switchAccount,
  doubleTapSwitchAccount,
  addLinkedAccount,
  getLinkedAccounts,
  removeLinkedAccount,
} from "../../../controller/tizzygo/auths/authController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = express.Router();

// Signup routes
router.post("/signup", sendSignupOtp);
router.post("/verify-signup", verifySignup);

// Login routes
router.post("/login", sendLoginOtp);
router.post("/verify-login", verifyLogin);

// Resend OTP
router.post("/resend-otp", resendOtp);
router.get("/check", checkAuth);

// Account switching
router.post("/switch-account", authMiddleware, switchAccount);
// ✅ Double tap switch account - Random account
router.post("/double-tap-switch", authMiddleware, doubleTapSwitchAccount);
router.post("/add-linked-account", authMiddleware, addLinkedAccount);
router.get("/linked-accounts", authMiddleware, getLinkedAccounts);
router.delete("/remove-linked-account", authMiddleware, removeLinkedAccount);

export default router;
