import express from "express";
import {
  createPayoutAccount,
  addBankFundAccount,
  addVpaFundAccount,
  addWalletFundAccount,
  getGatewayAccountByUserId,
  createPayout,
  getPayout,
  getFundAccount,
} from "../../../controller/tizzyos/PayoutPortal/PayoutPortalSetupController";
import { authMiddleware } from "../../../middleware/authMiddleware";

const router = express.Router();

// ======================================================
// ALL BELOW ROUTES REQUIRE AUTH
// ======================================================

// RazorpayX Contact
router.post("/payout-account", authMiddleware, createPayoutAccount);

// Fund Accounts
router.post("/payout-account/bank", authMiddleware, addBankFundAccount);
router.post("/payout-account/vpa", authMiddleware, addVpaFundAccount);
router.post("/payout-account/wallet", authMiddleware, addWalletFundAccount);

// Get Account
router.get("/payout-account/:userId", authMiddleware, getGatewayAccountByUserId);

// Create Payout
router.post("/seller-payout", authMiddleware, createPayout);

// Get Payout
router.get("/seller-payout/:payoutId", authMiddleware, getPayout);

// Get Fund Account
router.get("/fund-account/:fundAccountId", authMiddleware, getFundAccount);

export default router;