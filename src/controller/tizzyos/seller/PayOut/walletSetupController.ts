// controllers/sellerController.ts
import { Request, Response } from "express";
import { ZeptPay } from "@flixora/zeptpay";

// 🔒 Backend keys from .env
const ZEPTPAY_SECRET_KEY = process.env.ZEPTPAY_SECRET_KEY || "";
const ZEPTPAY_CLIENT_KEY =
  process.env.ZEPTPAY_CLIENT_KEY ||
  "ck-flixora_test_@zeptpay:tizzy-flixora-ecosystem_ae784c477ea88edec582ac2bb593195032dc203eacd4e375";

if (!ZEPTPAY_SECRET_KEY)
  throw new Error("ZEPTPAY_SECRET_KEY is not defined in .env");
if (!ZEPTPAY_CLIENT_KEY)
  throw new Error("ZEPTPAY_CLIENT_KEY is not defined in .env");

/**
 * ✅ CREATE SELLER (CREATE MERCHANT)
 * frontend sends publicKey as 'publicKey' in body
 */
export const createSeller = async (req: Request, res: Response) => {
  console.log("📥 [CREATE SELLER] Request received:", new Date().toISOString());

  try {
    const { seller, publicKey } = req.body;
    console.log("📦 [CREATE SELLER] Body keys:", Object.keys(req.body));

    // 🔹 Validate required fields
    if (!seller?.merchantName || !seller?.merchantEmail) {
      return res.status(400).json({
        success: false,
        message: "merchantName and merchantEmail are required",
      });
    }
    if (!publicKey) {
      return res.status(400).json({
        success: false,
        message: "frontend public key is required",
      });
    }

    // 🔹 Prepare merchant data
    const merchantData = {
      merchantName: seller.merchantName,
      merchantEmail: seller.merchantEmail,
      merchantPhone: seller.merchantPhone,
      businessName: seller.businessName,
      businessType: seller.businessType || "individual",
      businessCategory: seller.businessCategory,
      country: seller.country || "India",
      nationality: seller.nationality || "Indian",
      dob: seller.dob,
      mode: seller.mode || "test",
      metadata: seller.metadata || {},

      // 🔥 ADD THESE
      kycDetails: seller.kycDetails,
      bankDetails: seller.bankDetails,

      publicKey,
    };

    console.log("🔑 [CREATE SELLER] Prepared merchant data:", {
      merchantName: merchantData.merchantName,
      merchantEmail: merchantData.merchantEmail,
      hasPublicKey: !!merchantData.publicKey,
    });

    // 🔹 Call SDK → which calls company backend → returns token + merchant
    console.log("📡 [CREATE SELLER] Calling ZeptPay.flixora.createMerchant...");
    const result = await ZeptPay.flixora.createMerchant(publicKey, {
      ...merchantData,
      clientKey: ZEPTPAY_CLIENT_KEY,
      secretKey: ZEPTPAY_SECRET_KEY,
    });

    console.log("✅ [CREATE SELLER] Merchant created successfully:", {
      merchantId: result.merchant.merchantId,
      zeptpayMerchantId: result.merchant.zeptpayMerchantId,
      status: result.merchant.status,
    });

    // 🔹 Return final response to frontend
    return res.status(200).json({
      success: true,
      message: "Merchant created successfully",
      merchantId: result.merchant.merchantId,
      zeptpayMerchantId: result.merchant.zeptpayMerchantId,
      walletId: result.merchant.walletId,
      status: result.merchant.status,
      kycStatus: result.merchant.kycStatus,
      isKycCompleted: result.merchant.isKycCompleted,
      isBankDetailsCompleted: result.merchant.isBankDetailsCompleted,
      mode: result.merchant.mode,
      token: result.token,
    });
  } catch (error: any) {
    console.error("❌ [CREATE SELLER] Error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to create merchant",
      error: error.data || null,
    });
  }
};

/**
 * ✅ GET SELLER STATUS
 * Fetches merchant status from SDK and forwards exact response to frontend
 */
export const getSellerStatus = async (req: Request, res: Response) => {
  console.log(
    "📥 [GET SELLER STATUS] Request received:",
    new Date().toISOString(),
  );

  try {
    // 🔹 Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token is required",
      });
    }

    const token = authHeader.split(" ")[1];
    console.log("📌 Token extracted successfully");

    // 🔹 Call SDK
    const sdkResponse = await ZeptPay.flixora.getMerchantStatus(token);

    console.log("✅ [SDK RESPONSE RECEIVED]");

    console.log("🔍 [SDK RESPONSE] Keys:", Object.keys(sdkResponse));

    /**
     * ⚡ IMPORTANT:
     * Send EXACT SDK response to frontend.
     * Do NOT wrap or modify structure.
     */
    return res.status(200).json(sdkResponse);
  } catch (error: any) {
    console.error("❌ [GET SELLER STATUS ERROR]", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    // 🔹 If SDK returned proper HTTP error
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    // 🔹 Fallback error
    return res.status(500).json({
      success: false,
      message: "Failed to fetch merchant status",
    });
  }
};
