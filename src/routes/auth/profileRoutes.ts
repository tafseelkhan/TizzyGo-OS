// routes/auth/profileRoutes.ts

import { Router } from "express";

import {
  updateProfileController,
  updateAppRoleController,
  requestRecoveryConnectController,
  verifyRecoveryConnectController,
  requestPhoneChangeController,
  verifyPhoneChangeController,
} from "../../controller/auth/profileController";

import { authMiddleware } from "../../middleware/authMiddleware";

const router = Router();

// ============================================================
// 🔒 ALL PROFILE ROUTES REQUIRE AUTH
// ============================================================
router.use(authMiddleware);

// ============================================================
// 1. UPDATE BASIC PROFILE
//    PATCH /api/v0/auth/profile
// ============================================================
router.patch("/", updateProfileController);

// ============================================================
// 2. UPDATE APP-SPECIFIC ROLE
//    PATCH /api/v0/auth/profile/app-role
// ============================================================
router.patch("/app-role", updateAppRoleController);

// ============================================================
// 3. RECOVERY CONNECT — REQUEST OTP
//    PATCH /api/v0/auth/profile/recovery-connect
// ============================================================
router.patch(
  "/recovery-connect",
  requestRecoveryConnectController,
);

// ============================================================
// 3b. RECOVERY CONNECT — VERIFY OTP
//     POST /api/v0/auth/profile/recovery-connect/verify-otp
// ============================================================
router.post(
  "/recovery-connect/verify-otp",
  verifyRecoveryConnectController,
);

// ============================================================
// 4. CHANGE PHONE — REQUEST OTP
//    POST /api/v0/auth/profile/change-phone/request-otp
// ============================================================
router.post(
  "/change-phone/request-otp",
  requestPhoneChangeController,
);

// ============================================================
// 5. CHANGE PHONE — VERIFY OTP
//    POST /api/v0/auth/profile/change-phone/verify-otp
// ============================================================
router.post(
  "/change-phone/verify-otp",
  verifyPhoneChangeController,
);

export default router;