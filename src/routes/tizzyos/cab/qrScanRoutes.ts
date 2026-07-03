import { Router } from "express";
import {
  generateQRCodes,
  verifyPickup,
  verifyDrop,
  validateQRToken,
} from "../../../controller/tizzyos/cab/rideQRCodeController";
import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = Router();

router.post("/qr/generate/:bookingId", authMiddleware, generateQRCodes);
router.post("/qr/verify-pickup", authMiddleware, verifyPickup);
router.post("/qr/verify-drop", authMiddleware, verifyDrop);
router.post("/qr/validate", authMiddleware, validateQRToken);

export default router;
