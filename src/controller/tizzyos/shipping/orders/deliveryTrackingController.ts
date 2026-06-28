import { Response } from "express";
import jwt from "jsonwebtoken";
import DeliveryTracking from "../../../../models/tizzyos/shipping/order/deliveryTracking";
import FWSWareHouse from "../../../../models/tizzyos/fws/fwsWareHouse";
import Shipping from "../../../../models/tizzyos/shipping/fws/fwsRegistration";
import { TrackingService } from "../../../../services/tizzyos/shippings/trackingServices";
import { AuthRequest } from "../../../../types/tizzyos/trackingTypes";

// ============================================
// QR VISIBILITY & HANDOVER (NEW)
// ============================================

export const getQRVisibility = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.userId;
    if (!userId)
      return res.status(401).json({ error: "Authentication required" });
    const result = await TrackingService.getQRVisibility(orderId, userId);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

// ============================================
// SELLER FLOW APIS
// ============================================

export const sellerAcceptOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.body;
    const userId = req.user?.userId;
    if (!userId)
      return res.status(401).json({ error: "Authentication required" });
    if (!orderId)
      return res.status(400).json({ error: "Order ID is required" });
    const result = await TrackingService.sellerAcceptOrder(orderId, userId);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const intransitToFWS = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.body;
    const userId = req.user?.userId;
    if (!userId)
      return res.status(401).json({ error: "Authentication required" });
    if (!orderId)
      return res.status(400).json({ error: "Order ID is required" });
    const result = await TrackingService.intransitToFWS(orderId, String(userId));
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export const sellerAssignShipping = async (req: AuthRequest, res: Response) => {
  try {
    const {
      orderId,
      shippingId,
      assignmentType = "AUTO",
      shippingType,
    } = req.body;
    const userId = req.user?.userId;
    if (!userId)
      return res.status(401).json({ error: "Authentication required" });
    if (!orderId)
      return res.status(400).json({ error: "Order ID is required" });
    if (!shippingType || !["RIDER", "TRUCK"].includes(shippingType)) {
      return res
        .status(400)
        .json({ error: "Valid shipping type (RIDER/TRUCK) is required" });
    }
    if (assignmentType === "MANUAL" && !shippingId) {
      return res
        .status(400)
        .json({ error: "Shipping ID is required for manual assignment" });
    }
    const assignment = await TrackingService.sellerAssignShipping(
      orderId,
      userId,
      shippingId,
      assignmentType,
      shippingType,
    );
    res.status(200).json({ success: true, data: assignment });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// ============================================================
// API 1: HANDOVER VIA QR - COMPLETE FIXED WITH DUPLICATE HANDLING
// ============================================================

export const handoverViaQR = async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body;
    const userId = req.user?.userId;

    console.log("\n=== HANDOVER VIA QR DEBUG ===");
    console.log("Received token:", token);
    console.log("Token length:", token?.length);
    console.log("Scanner userId:", userId);
    console.log("QR_SECRET exists:", !!process.env.QR_SECRET);
    console.log("QR_SECRET length:", process.env.QR_SECRET?.length);

    // ✅ Validate userId
    if (!userId) {
      console.log("❌ Authentication Failed: No userId found");
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        details: "User ID not found in request",
      });
    }

    // ✅ Validate token
    if (!token) {
      console.log("❌ Validation Failed: No token provided");
      return res.status(400).json({
        success: false,
        error: "Token is required",
        details: "token field is missing in request body",
      });
    }

    console.log("🔄 Calling TrackingService.handoverViaQR");
    console.log("📤 Service Parameters:");
    console.log("  - token:", token.substring(0, 50) + "...");
    console.log("  - userId:", userId);
    console.log("========================================\n");

    // ✅ Call service
    const result = await TrackingService.handoverViaQR(token, userId);

    console.log("=== HANDOVER VIA QR SUCCESS ===");
    console.log("Result:", JSON.stringify(result, null, 2));
    console.log("================================\n");

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("\n❌ HANDOVER VIA QR ERROR:");
    console.error("  Message:", error.message);
    console.error("  StatusCode:", error.statusCode);
    console.error("  Response:", error.response);
    console.error("================================\n");

    // ✅ Check for duplicate scan error
    if (error.response && error.response.duplicate === true) {
      console.log("⚠️ Duplicate scan detected, returning 409");
      return res.status(error.statusCode || 409).json({
        success: false,
        duplicate: true,
        code: "DUPLICATE_SCAN",
        message: error.response.message || "Duplicate Scan Not Allowed",
        details: error.response.details || "This QR has already been scanned.",
      });
    }

    // ✅ Check for alreadyScanned flag
    if (error.message === "Duplicate Scan Not Allowed") {
      console.log("⚠️ Duplicate scan detected (message), returning 409");
      return res.status(409).json({
        success: false,
        duplicate: true,
        code: "DUPLICATE_SCAN",
        message: "Duplicate Scan Not Allowed",
        details: error.response?.details || "This QR has already been scanned.",
      });
    }

    // ✅ Check for duplicate keyword in error message
    if (
      error.message &&
      (error.message.includes("duplicate") ||
        error.message.includes("already scanned") ||
        error.message.includes("already verified"))
    ) {
      console.log("⚠️ Duplicate detected in error message, returning 409");
      return res.status(409).json({
        success: false,
        duplicate: true,
        code: "DUPLICATE_SCAN",
        message: "Duplicate Scan Not Allowed",
        details: error.message,
      });
    }

    // ✅ Handle other errors
    const statusCode = error.statusCode || 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to process handover",
      ...(process.env.NODE_ENV === "development" && {
        stack: error.stack,
        name: error.name,
      }),
    });
  }
};

// ============================================================
// API 2: VERIFY QR AND MARK READY FOR DISPATCH - COMPLETE FIXED
// ============================================================

export const verifyQR = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    console.log("════════════════════════════════════════════");
    console.log("🔍 VERIFY QR CONTROLLER - REQUEST RECEIVED");
    console.log("════════════════════════════════════════════");

    // ✅ Log full request details
    console.log("📋 Request Headers:", JSON.stringify(req.headers, null, 2));
    console.log("📋 Request Body:", JSON.stringify(req.body, null, 2));
    console.log("📋 Request User:", req.user);

    const { qrData } = req.body;
    const userId = req.user?.userId;

    console.log("📝 Extracted qrData:", qrData);
    console.log("📝 qrData Type:", typeof qrData);
    console.log(
      "📝 qrData Keys:",
      qrData ? Object.keys(qrData) : "null/undefined",
    );
    console.log("📝 User ID:", userId);
    console.log("📝 User ID Type:", typeof userId);

    // ✅ Validate userId
    if (!userId) {
      console.log("❌ Authentication Failed: No userId found");
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        details: "User ID not found in request",
      });
    }

    // ✅ Validate qrData
    if (!qrData) {
      console.log("❌ Validation Failed: No qrData provided");
      return res.status(400).json({
        success: false,
        error: "QR data is required",
        details: "qrData field is missing in request body",
      });
    }

    // ✅ Log what we're sending to service
    console.log("🔄 Calling TrackingService.verifyQRAndMarkReadyForDispatch");
    console.log("📤 Service Parameters:");
    console.log("  - qrData:", JSON.stringify(qrData, null, 2));
    console.log("  - userId:", userId);
    console.log("════════════════════════════════════════════");

    // ✅ Call service
    const verificationData =
      await TrackingService.verifyQR(qrData, userId);

    console.log("════════════════════════════════════════════");
    console.log("✅ VERIFY QR CONTROLLER - SUCCESS");
    console.log("════════════════════════════════════════════");
    console.log(
      "📦 Verification Data:",
      JSON.stringify(verificationData, null, 2),
    );
    console.log("════════════════════════════════════════════");

    res.status(200).json({
      success: true,
      data: verificationData,
    });
  } catch (error: any) {
    console.log("════════════════════════════════════════════");
    console.log("❌ VERIFY QR CONTROLLER - ERROR");
    console.log("════════════════════════════════════════════");

    // ✅ Log full error details
    console.log("💥 Error Name:", error.name);
    console.log("💥 Error Message:", error.message);
    console.log("💥 Error Stack:", error.stack);
    console.log("💥 Error StatusCode:", error.statusCode);
    console.log("💥 Error Response:", error.response);

    // ✅ Check for duplicate scan error
    if (error.response && error.response.duplicate === true) {
      console.log("⚠️ Duplicate verification detected, returning 409");
      return res.status(error.statusCode || 409).json({
        success: false,
        duplicate: true,
        code: "DUPLICATE_SCAN",
        message: error.response.message || "Duplicate Scan Not Allowed",
        details:
          error.response.details ||
          "This QR has already been verified at this FWS.",
      });
    }

    // ✅ Check for duplicate in error message
    if (
      error.message &&
      (error.message.includes("duplicate") ||
        error.message.includes("already verified") ||
        error.message.includes("already scanned"))
    ) {
      console.log("⚠️ Duplicate detected in error message, returning 409");
      return res.status(409).json({
        success: false,
        duplicate: true,
        code: "DUPLICATE_SCAN",
        message: "Duplicate Scan Not Allowed",
        details: error.message,
      });
    }

    // ✅ Check for processingStage SCANNED
    if (
      error.message &&
      error.message.includes("already verified and ready for dispatch")
    ) {
      console.log("⚠️ Parcel already verified (processingStage), returning 409");
      return res.status(409).json({
        success: false,
        duplicate: true,
        code: "DUPLICATE_SCAN",
        message: "Duplicate Scan Not Allowed",
        details: error.message,
      });
    }

    // ✅ Send appropriate error response
    const statusCode = error.statusCode || 400;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to verify QR code",
      details:
        process.env.NODE_ENV === "development"
          ? {
              stack: error.stack,
              name: error.name,
            }
          : undefined,
    });
  }
};

export const fwsAssignShipping = async (req: AuthRequest, res: Response) => {
  console.log("=== fwsAssignShipping called ===");
  console.log("Request body:", req.body);
  
  try {
    const {
      orderId,
      shippingId,
      assignmentType = "AUTO",
      shippingType,
    } = req.body;
    const userId = req.user?.userId;
    
    console.log("Extracted values:", { orderId, shippingId, assignmentType, shippingType, userId });
    
    if (!userId) {
      console.log("❌ Authentication failed: No userId found");
      return res.status(401).json({ error: "Authentication required" });
    }
    
    if (!orderId) {
      console.log("❌ Validation failed: No orderId provided");
      return res.status(400).json({ error: "Order ID is required" });
    }
    
    if (!shippingType || !["RIDER", "TRUCK"].includes(shippingType)) {
      console.log("❌ Validation failed: Invalid shippingType:", shippingType);
      return res
        .status(400)
        .json({ error: "Valid shipping type (RIDER/TRUCK) is required" });
    }
    
    if (assignmentType === "MANUAL" && !shippingId) {
      console.log("❌ Validation failed: Manual assignment requires shippingId");
      return res
        .status(400)
        .json({ error: "Shipping ID is required for manual assignment" });
    }
    
    console.log("✅ All validations passed. Calling TrackingService.fwsAssignShipping...");
    console.log("Parameters:", { orderId, userId, shippingId, assignmentType, shippingType });
    
    const assignment = await TrackingService.fwsAssignShipping(
      orderId,
      userId,
      shippingId,
      assignmentType,
      shippingType,
    );
    
    console.log("✅ Assignment successful:", assignment);
    res.status(200).json({ success: true, data: assignment });
    
  } catch (error: any) {
    console.error("❌ Error in fwsAssignShipping:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    res.status(400).json({ error: error.message });
  }
};

// ============================================
// SHIPPING PARTNER FLOW (RIDER/TRUCK)
// ============================================

export const acceptAssignment = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, assignmentId } = req.body;
    const userId = req.user?.userId;
    console.log("orderId:", orderId);
    console.log("assignmentId:", assignmentId);
    if (!userId)
      return res.status(401).json({ error: "Authentication required" });
    if (!orderId || !assignmentId) {
      return res
        .status(400)
        .json({ error: "Order ID and assignment ID are required" });
    }
    const result = await TrackingService.acceptAssignment(
      orderId,
      assignmentId,
      userId,
    );
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getOrderQRCode = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.userId;
    if (!userId)
      return res.status(401).json({ error: "Authentication required" });
    const result = await TrackingService.getOrderQRCode(orderId, userId);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

// ============================================
// QUERY APIS
// ============================================

export const getTrackingDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.userId;
    if (!userId)
      return res.status(401).json({ error: "Authentication required" });
    if (!orderId)
      return res.status(400).json({ error: "Order ID is required" });
    const tracking = await TrackingService.getTrackingByOrderId(
      orderId,
      userId,
    );
    res.status(200).json({ success: true, data: tracking });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getSellerOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId)
      return res.status(401).json({ error: "Authentication required" });
    const orders = await TrackingService.getOrdersBySeller(userId);
    res.status(200).json({ success: true, data: orders });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getFWSOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId)
      return res.status(401).json({ error: "Authentication required" });
    const orders = await TrackingService.getOrdersByFWS(userId);
    res.status(200).json({ success: true, data: orders });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getRiderTruckOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId)
      return res.status(401).json({ error: "Authentication required" });
    const orders = await TrackingService.getOrdersByShippingPartner(userId);
    res.status(200).json({ success: true, data: orders });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getOrderById = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;

    console.log("═══════════════════════════════════════");
    console.log("🔍 GET ORDER BY ID CONTROLLER");
    console.log("═══════════════════════════════════════");
    console.log("📥 Params:", req.params);

    const order = await TrackingService.getOrderById(orderId);
    return res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      data: order,
    });
  } catch (error: any) {
    console.error("❌ Get Order Error:", error);

    return res.status(404).json({
      success: false,
      message: error.message || "Failed to fetch order",
    });
  }
};
