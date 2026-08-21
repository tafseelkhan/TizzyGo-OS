// ============================================================
// controllers/tizzygo/checkout/orderConfirmationController.ts
// ============================================================

import { Request, Response } from "express";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import { OrderConfirmationService } from "../../../services/tizzygo/orderConfirmationService";

export const getOrderConfirmation = async (req: AuthRequest, res: Response) => {
  try {
    console.log("========================================");
    console.log("📋 ORDER CONFIRMATION API CALLED");
    console.log("========================================");
    console.log(`📋 CheckoutSession ID: ${req.params.checkoutSessionId}`);
    console.log(`👤 User ID: ${req.user?.userId}`);

    const { checkoutSessionId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized: User not authenticated",
      });
    }

    if (!checkoutSessionId) {
      return res.status(400).json({
        success: false,
        error: "checkoutSessionId is required",
      });
    }

    const confirmation = await OrderConfirmationService.getConfirmation(
      checkoutSessionId,
      userId,
    );

    console.log(`✅ Order confirmation fetched successfully`);
    console.log(`📊 Status: ${confirmation.confirmationStatus}`);
    console.log(`📦 Orders: ${confirmation.orders.length}`);
    console.log(`⏱️ Remaining: ${confirmation.timer.remainingSeconds}s`);
    console.log("========================================");

    return res.status(200).json(confirmation);
  } catch (error: any) {
    console.error("========================================");
    console.error("❌ ORDER CONFIRMATION API ERROR");
    console.error("========================================");
    console.error(`Error: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    console.error("========================================");

    if (error.message === "Checkout session not found") {
      return res.status(404).json({
        success: false,
        error: "Checkout session not found",
      });
    }

    if (error.message === "No orders found for this checkout session") {
      return res.status(404).json({
        success: false,
        error: "No orders found for this checkout session",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
