// routes/sellerRoutes.ts

import express from "express";
import {
  createSeller,
  getSellerStatus,
} from "../../../../controller/tizzyos/seller/PayOut/walletSetupController";

const router = express.Router();

// ==================== MERCHANT ENDPOINTS ====================

/**
 * @route   POST /api/sellers
 * @desc    Create a new merchant/seller
 * @access  Public (called from frontend)
 * @body    {
 *            seller: {
 *              merchantName: string,
 *              merchantEmail: string,
 *              merchantPhone?: string,
 *              businessName?: string,
 *              businessType?: "individual" | "company",
 *              country?: string,
 *              mode?: "test" | "live"
 *            },
 *            publicKey: string  // From frontend ZeptPayProvider
 *          }
 *
 * @example
 * fetch('/api/sellers', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     seller: {
 *       merchantName: "John Doe",
 *       merchantEmail: "john@example.com",
 *       businessType: "individual"
 *     },
 *     publicKey: "pk_test_abc123..."
 *   })
 * })
 */
router.post("/sellers", createSeller);

/**
 * @route   GET /api/sellers/:merchantId/status
 * @desc    Get merchant status by ID
 * @access  Public (with token optional)
 * @params  merchantId: string
 * @headers Optional: Authorization: Bearer <token>
 * @access  Optional?!!
 * @example
 * fetch('/api/sellers/merch_123/status')
 */
router.get("/sellers/status", getSellerStatus);

export default router;
