import express from "express";
import {
  createProtectionRequest,
  getProtectionRequests,
  approveProtectionRequest,
  rejectProtectionRequest,
  checkUserRequest,
} from "../../../../controller/tizzyos/request/protectionRequestController";
import { authMiddleware } from "../../../../middleware/tizzygo/authMiddleware";

const router = express.Router();

// User sends product request
router.post("/request", authMiddleware, createProtectionRequest);
// Fetch all product requests
router.get("/requests", getProtectionRequests);
// ✅ Check request API
router.get("/check", authMiddleware, checkUserRequest);

// PanelX side (will call these)
router.put("/request/:id/approve", approveProtectionRequest);
router.put("/request/:id/reject", rejectProtectionRequest);

export default router;
