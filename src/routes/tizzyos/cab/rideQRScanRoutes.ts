// routes/tizzyos/cab/rideQRCodeRoutes.ts

import { Router } from "express";
import {
  generateQRCodes,
  verifyPickup,
  verifyDrop,
  validateQRToken,
  getQRStatus,
  regenerateQRCodes,
} from "../../../controller/tizzyos/cab/rideQRCodeController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = Router();

// =====================================================
// POST /api/ride/qr/generate/:bookingId
//
// Purpose:
// Generates QR codes for pickup and drop verification.
//
// Called By:
// Driver App, Internal
// =====================================================
router.post("/qr/generate/:bookingId", authMiddleware, generateQRCodes);

// =====================================================
// POST /api/ride/qr/verify-pickup
//
// Purpose:
// Verifies pickup using QR token.
//
// Called By:
// Driver App
// =====================================================
router.post("/qr/verify-pickup", authMiddleware, verifyPickup);

// =====================================================
// POST /api/ride/qr/verify-drop
//
// Purpose:
// Verifies drop using QR token.
//
// Called By:
// Driver App
// =====================================================
router.post("/qr/verify-drop", authMiddleware, verifyDrop);

// =====================================================
// POST /api/ride/qr/validate
//
// Purpose:
// Validates a QR token.
//
// Called By:
// Driver App
// =====================================================
router.post("/qr/validate", authMiddleware, validateQRToken);

// =====================================================
// GET /api/ride/qr/status/:bookingId
//
// Purpose:
// Retrieves QR status for a booking.
//
// Called By:
// Customer Frontend, Driver App
// =====================================================
router.get("/qr/status/:bookingId", authMiddleware, getQRStatus);

// =====================================================
// POST /api/ride/qr/regenerate/:bookingId
//
// Purpose:
// Regenerates QR codes.
//
// Called By:
// Driver App, Internal
// =====================================================
router.post("/qr/regenerate/:bookingId", authMiddleware, regenerateQRCodes);

export default router;
