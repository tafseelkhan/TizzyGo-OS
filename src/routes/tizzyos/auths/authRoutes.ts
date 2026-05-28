import express from "express";
import {
  sendSignupOtp,
  verifySignup,
  sendLoginOtp,
  verifyLogin,
  resendOtp,
  checkAuth,
} from "../../../controller/tizzyos/auths/authController";

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

export default router;
