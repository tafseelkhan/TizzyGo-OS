import express from "express";

import {
  createPayoutAccount,
  updatePayoutAccount,
  getPayoutAccountStatus,
} from "../../../controller/tizzyos/PayoutPortal/PayoutPortalSetupController";

import { authMiddleware } from "../../../middleware/tizzygo/authMiddleware";

const router = express.Router();

router.post("/razorpay/create", authMiddleware, createPayoutAccount);

router.patch("/razorpay/update", authMiddleware, updatePayoutAccount);

router.get("/razorpay/:userId/status", authMiddleware, getPayoutAccountStatus);

export default router;
