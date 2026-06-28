// controller/tizzyos/shipping/orders/deliveredWithOTP.ts

import mongoose from "mongoose";
import { Request, Response } from "express";
import Order from "../../../../models/tizzyos/shipping/order/order";
import DeliveryTracking from "../../../../models/tizzyos/shipping/order/deliveryTracking";
import User from "../../../../models/tizzygo/auths/User";
import { sendOTPEmail } from "../../../../services/tizzyos/shippings/deliveryOTPServices";

// ============================================
// HELPER: Generate Scan ID for routeHistory
// ============================================

const generateScanId = (
  orderId: string,
  fromHolderId: string,
  toHolderId: string,
  scanType: "HANDOVER" | "VERIFICATION" | "DISPATCH" | "DELIVERY",
): string => {
  return `${orderId}_${fromHolderId}_${toHolderId}_${scanType}`;
};

// ============================================
// ✅ NEW: Generate Permanent Scan Fingerprint
// ============================================

const generateScanFingerprint = (
  orderId: string,
  fromHolderId: string,
  toHolderId: string,
  scanType: "HANDOVER" | "VERIFICATION" | "DISPATCH" | "DELIVERY",
  scannedByUserId: string,
): string => {
  return `${orderId}_${fromHolderId}_${toHolderId}_${scanType}_${scannedByUserId}`;
};

// ============================================
// ✅ NEW: Check Duplicate Scan by Fingerprint
// ============================================

const checkDuplicateScanByFingerprint = (
  routeHistory: any[],
  fingerprint: string,
): boolean => {
  return routeHistory.some((r: any) => r.scanFingerprint === fingerprint);
};

// ============================================
// HELPER: Generate OTP
// ============================================

const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ============================================
// HELPER: Get Buyer Email from User Model
// ============================================

const getBuyerEmail = async (buyerId: string): Promise<string | null> => {
  try {
    if (!buyerId) return null;

    const user = await User.findById(buyerId);
    if (!user) {
      console.log(`❌ User not found for ID: ${buyerId}`);
      return null;
    }

    const email = user.email || user.emailId || user.emailAddress || null;
    console.log(`👤 Found buyer email: ${email}`);
    return email;
  } catch (error) {
    console.error("❌ Error fetching buyer email:", error);
    return null;
  }
};

// ============================================
// HELPER: Get Buyer Name from User Model
// ============================================

const getBuyerName = async (buyerId: string): Promise<string | null> => {
  try {
    if (!buyerId) return null;

    const user = await User.findById(buyerId);
    if (!user) return null;

    const name = user.name || user.fullName || user.displayName || null;
    return name;
  } catch (error) {
    console.error("❌ Error fetching buyer name:", error);
    return null;
  }
};

// ============================================
// API 1: Initiate Delivery (Generate OTP)
// ============================================

export const initiateDelivery = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("\n🚚 ========== INITIATE DELIVERY ==========");

    const authUser = (req as any).user;
    console.log("👤 Authenticated User:", {
      userId: authUser?._id,
      userType: authUser?.userType,
      email: authUser?.email,
    });

    if (!authUser) {
      console.log("❌ Authentication failed: No user found");
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Please login first",
      });
    }

    const loggedInUserId = authUser._id.toString();
    console.log("🔑 Logged In User ID:", loggedInUserId);

    const { orderId } = req.body;
    console.log("📦 Order ID:", orderId);

    if (!orderId) {
      console.log("❌ Validation failed: Order ID is required");
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    console.log("\n📦 === FINDING ORDER ===");
    const order = await Order.findOne({ orderId }).session(session);

    if (!order) {
      console.log("❌ Order not found:", orderId);
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: `Order with ID ${orderId} not found`,
      });
    }

    console.log("✅ Order found:", {
      orderId: order.orderId,
      status: order.status,
      buyerId: order.buyerId,
      buyerName: order.buyerName,
      fulfillmentType: order.fulfillmentType,
    });

    if (order.status === "delivered") {
      console.log("❌ Order already delivered");
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Order is already delivered",
      });
    }

    console.log("\n📋 === FINDING TRACKING ===");
    const tracking = await DeliveryTracking.findOne({ orderId }).session(
      session,
    );

    if (!tracking) {
      console.log("❌ Tracking not found for order:", orderId);
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: `Tracking information not found for order ${orderId}`,
      });
    }

    console.log("✅ Tracking found:", {
      trackingId: tracking.trackingId,
      currentStatus: tracking.currentStatus,
      currentHolderType: tracking.currentHolderType,
      currentHolderId: tracking.currentHolderId,
      currentHolderName: tracking.currentHolderName,
    });

    console.log("\n🔐 === VALIDATING CURRENT HOLDER ===");

    const allowedHolderTypes = ["RIDER", "TRUCK"];
    if (!allowedHolderTypes.includes(tracking.currentHolderType)) {
      console.log(`❌ Invalid holder type: ${tracking.currentHolderType}`);
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: `Only RIDER or TRUCK can deliver. Current holder is ${tracking.currentHolderType}`,
      });
    }

    if (tracking.currentHolderId !== loggedInUserId) {
      console.log("❌ Current holder mismatch:");
      console.log(`   Tracking holder: ${tracking.currentHolderId}`);
      console.log(`   Logged in user: ${loggedInUserId}`);
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: "You are not the current holder of this parcel.",
      });
    }

    console.log("✅ Current holder validation passed:");
    console.log(`   Holder Type: ${tracking.currentHolderType}`);
    console.log(`   Holder ID: ${tracking.currentHolderId}`);
    console.log(`   Holder Name: ${tracking.currentHolderName}`);

    console.log("\n📊 === VALIDATING ORDER STATUS ===");
    const allowedStatuses = ["in_transit", "out_for_delivery"];
    if (!allowedStatuses.includes(tracking.currentStatus)) {
      console.log(`❌ Invalid current status: ${tracking.currentStatus}`);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Order must be ${allowedStatuses.join(" or ")}. Current status: ${tracking.currentStatus}`,
      });
    }

    console.log(`✅ Current status validated: ${tracking.currentStatus}`);

    console.log("\n👤 === FETCHING BUYER DETAILS ===");

    let buyerEmail: string | null = null;
    let buyerName: string | null = order.buyerName || null;

    if (order.buyerId) {
      buyerEmail = await getBuyerEmail(order.buyerId);
      if (!buyerName) {
        buyerName = await getBuyerName(order.buyerId);
      }
      console.log("✅ Buyer details fetched:");
      console.log(`   Buyer ID: ${order.buyerId}`);
      console.log(`   Buyer Email: ${buyerEmail || "Not found"}`);
      console.log(`   Buyer Name: ${buyerName || "Not found"}`);
    } else {
      console.warn("⚠️ No buyerId found in order");
    }

    console.log("\n🔐 === GENERATING OTP ===");
    const newOTP = generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    console.log("   Generated OTP:", newOTP);
    console.log("   Expires at:", expiresAt);

    console.log("\n📦 === UPDATING ORDER WITH OTP ===");

    order.metadata = {
      ...order.metadata,
      deliveryOtp: newOTP,
      isDeliveryOtpUsed: false,
      otpExpiresAt: expiresAt,
      otpGeneratedAt: new Date(),
      otpGeneratedBy: {
        userId: loggedInUserId,
        userType: tracking.currentHolderType,
        userName: authUser.name || authUser.email,
      },
      buyerEmail: buyerEmail,
    };

    if (buyerName && !order.buyerName) {
      order.buyerName = buyerName;
    }

    await order.save({ session });
    console.log("✅ Order updated with OTP");

    console.log("\n📧 === SENDING OTP EMAIL ===");

    const finalBuyerEmail =
      buyerEmail || order.buyerEmail || order.metadata?.buyerEmail;
    const finalBuyerName = buyerName || order.buyerName || "Customer";

    if (finalBuyerEmail) {
      try {
        await sendOTPEmail({
          to: finalBuyerEmail,
          name: finalBuyerName,
          otp: newOTP,
          orderId: order.orderId,
          expiresInMinutes: 5,
        });
        console.log(`✅ OTP email sent to: ${finalBuyerEmail}`);
      } catch (emailError) {
        console.error("❌ Failed to send OTP email:", emailError);
      }
    } else {
      console.warn("⚠️ No buyer email found. OTP not sent via email.");
    }

    await session.commitTransaction();
    session.endSession();

    console.log("✅ Transaction committed successfully");
    console.log("🎉 OTP generated and sent successfully!");
    console.log("========================================\n");

    return res.status(200).json({
      success: true,
      message: finalBuyerEmail
        ? "OTP generated and sent to buyer successfully"
        : "OTP generated but buyer email not found.",
      data: {
        orderId: order.orderId,
        trackingId: tracking.trackingId,
        expiresAt: expiresAt,
        expiresInMinutes: 5,
        buyerEmail: finalBuyerEmail,
        buyerName: finalBuyerName,
        ...(process.env.NODE_ENV === "development" && { otp: newOTP }),
      },
    });
  } catch (error: any) {
    console.error("\n❌ ========== ERROR ==========");
    console.error("Error in initiateDelivery:", error);
    console.error("Error stack:", error.stack);
    console.error("================================\n");

    await session.abortTransaction();
    session.endSession();

    return res.status(500).json({
      success: false,
      message: "Failed to initiate delivery",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ============================================
// API 2: Verify OTP and Complete Delivery
// ============================================

export const deliverWithOTP = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("\n🚚 ========== DELIVERY WITH OTP ==========");

    const authUser = (req as any).user;
    console.log("👤 Authenticated User:", {
      userId: authUser?._id,
      userType: authUser?.userType,
      email: authUser?.email,
    });

    if (!authUser) {
      console.log("❌ Authentication failed: No user found");
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Please login first",
      });
    }

    const loggedInUserId = authUser._id.toString();
    console.log("🔑 Logged In User ID:", loggedInUserId);

    const { orderId, otp } = req.body;
    console.log("📦 Order ID:", orderId);
    console.log("🔐 OTP Provided:", otp);

    if (!orderId) {
      console.log("❌ Validation failed: Order ID is required");
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      console.log("❌ Validation failed: Invalid OTP format");
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Valid 6-digit OTP is required",
      });
    }

    console.log("\n📦 === FINDING ORDER ===");
    const order = await Order.findOne({ orderId }).session(session);

    if (!order) {
      console.log("❌ Order not found:", orderId);
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: `Order with ID ${orderId} not found`,
      });
    }

    console.log("✅ Order found:", {
      orderId: order.orderId,
      status: order.status,
      buyerId: order.buyerId,
      buyerName: order.buyerName,
      fulfillmentType: order.fulfillmentType,
    });

    console.log("\n🔍 === CHECKING DELIVERY STATUS ===");
    const existingTracking = await DeliveryTracking.findOne({
      orderId,
    }).session(session);

    if (existingTracking && existingTracking.currentStatus === "delivered") {
      console.log("❌ Order already delivered (tracking status)");
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Order is already delivered",
      });
    }

    console.log("\n📋 === FINDING TRACKING ===");
    const tracking = await DeliveryTracking.findOne({ orderId }).session(
      session,
    );

    if (!tracking) {
      console.log("❌ Tracking not found for order:", orderId);
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: `Tracking information not found for order ${orderId}`,
      });
    }

    console.log("✅ Tracking found:", {
      trackingId: tracking.trackingId,
      currentStatus: tracking.currentStatus,
      currentHolderType: tracking.currentHolderType,
      currentHolderId: tracking.currentHolderId,
      currentHolderName: tracking.currentHolderName,
    });

    console.log("\n🔐 === VALIDATING CURRENT HOLDER ===");

    const allowedHolderTypes = ["RIDER", "TRUCK"];
    if (!allowedHolderTypes.includes(tracking.currentHolderType)) {
      console.log(`❌ Invalid holder type: ${tracking.currentHolderType}`);
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: `Only RIDER or TRUCK can deliver. Current holder is ${tracking.currentHolderType}`,
      });
    }

    if (tracking.currentHolderId !== loggedInUserId) {
      console.log("❌ Current holder mismatch:");
      console.log(`   Tracking holder: ${tracking.currentHolderId}`);
      console.log(`   Logged in user: ${loggedInUserId}`);
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: "You are not the current holder of this parcel.",
      });
    }

    console.log("✅ Current holder validation passed:");
    console.log(`   Holder Type: ${tracking.currentHolderType}`);
    console.log(`   Holder ID: ${tracking.currentHolderId}`);
    console.log(`   Holder Name: ${tracking.currentHolderName}`);

    console.log("\n📊 === VALIDATING TRACKING STATUS ===");
    const allowedStatuses = ["in_transit", "out_for_delivery"];
    if (!allowedStatuses.includes(tracking.currentStatus)) {
      console.log(`❌ Invalid current status: ${tracking.currentStatus}`);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Order must be ${allowedStatuses.join(" or ")}. Current status: ${tracking.currentStatus}`,
      });
    }

    console.log(`✅ Current status validated: ${tracking.currentStatus}`);

    console.log("\n🔐 === VALIDATING OTP ===");
    const deliveryOtp = order.metadata?.deliveryOtp;
    const isDeliveryOtpUsed = order.metadata?.isDeliveryOtpUsed || false;
    const otpExpiresAt = order.metadata?.otpExpiresAt;

    console.log("   Stored OTP:", deliveryOtp);
    console.log("   OTP Used:", isDeliveryOtpUsed);
    console.log("   OTP Expires At:", otpExpiresAt);

    if (!deliveryOtp) {
      console.log("❌ No OTP found for this order");
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "No OTP generated for this order. Please request a new OTP.",
      });
    }

    if (isDeliveryOtpUsed) {
      console.log("❌ OTP already used");
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "This OTP has already been used. Please request a new OTP.",
      });
    }

    if (otpExpiresAt) {
      const now = new Date();
      const expiresAt = new Date(otpExpiresAt);
      if (now > expiresAt) {
        console.log(`❌ OTP expired. Expired at: ${expiresAt}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "OTP has expired. Please request a new OTP.",
        });
      }
      console.log(`✅ OTP is valid. Expires at: ${expiresAt}`);
    }

    if (deliveryOtp.toString() !== otp.toString()) {
      console.log(`❌ OTP mismatch: Provided ${otp}, Expected ${deliveryOtp}`);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid OTP. Please check and try again.",
      });
    }

    console.log("✅ OTP validated successfully");

    // Store previous holder values BEFORE changing them
    const previousHolderId = tracking.currentHolderId;
    const previousHolderType = tracking.currentHolderType;
    const previousHolderName = tracking.currentHolderName || "Unknown";

    console.log("\n📋 === PREVIOUS HOLDER VALUES (for route history) ===");
    console.log(`   Previous Holder ID: ${previousHolderId}`);
    console.log(`   Previous Holder Type: ${previousHolderType}`);
    console.log(`   Previous Holder Name: ${previousHolderName}`);

    // ============================================================
    // ✅ DUPLICATE DELIVERY DETECTION using FINGERPRINT
    // ============================================================

    const deliveryFingerprint = generateScanFingerprint(
      orderId,
      previousHolderId || "unknown",
      order.buyerId || "buyer",
      "DELIVERY",
      loggedInUserId,
    );

    if (
      checkDuplicateScanByFingerprint(
        tracking.routeHistory,
        deliveryFingerprint,
      )
    ) {
      console.log("❌ Duplicate delivery detected!");
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        alreadyScanned: true,
        message: "This order has already been delivered.",
      });
    }

    console.log(
      `✅ No duplicate delivery found. Fingerprint: ${deliveryFingerprint}`,
    );

    console.log("\n📱 === RELEASING QR OWNERSHIP ===");
    let releasedOwner = null;
    if (tracking.qrOwnershipHistory && tracking.qrOwnershipHistory.length > 0) {
      const activeEntry = tracking.qrOwnershipHistory.find(
        (entry: any) =>
          entry.releasedAt === null || entry.releasedAt === undefined,
      );

      if (activeEntry) {
        activeEntry.releasedAt = new Date();
        releasedOwner = {
          holderId: activeEntry.holderId,
          holderType: activeEntry.holderType,
          holderName: activeEntry.holderName,
        };
        console.log("✅ QR Ownership released:", {
          holderId: activeEntry.holderId,
          holderType: activeEntry.holderType,
          releasedAt: activeEntry.releasedAt,
        });
      } else {
        console.log("⚠️ No active QR ownership found to release");
      }
    }

    console.log("\n📝 === UPDATING TRACKING DOCUMENT ===");

    const now = new Date();

    tracking.currentHolderType = "BUYER";
    tracking.currentHolderId = order.buyerId || "buyer";
    tracking.currentHolderName = order.buyerName || "Buyer";

    tracking.currentStatus = "delivered";
    tracking.deliveredAt = now;

    tracking.currentShipping = null;
    tracking.currentFWS = null;

    // ✅ Update pendingAssignment - Mark as COMPLETED
    if (tracking.pendingAssignment) {
      // Find in history and update
      const historyIndex = (tracking.assignmentHistory || []).findIndex(
        (a: any) => a.assignmentId === tracking.pendingAssignment?.assignmentId,
      );

      if (historyIndex !== -1) {
        tracking.assignmentHistory[historyIndex].status = "ACCEPTED";
        tracking.assignmentHistory[historyIndex].completedAt = now;
      }

      // Update pendingAssignment status to COMPLETED
      tracking.pendingAssignment.status = "ACCEPTED";
    }

    // Add scanId and scanFingerprint to routeHistory
    const scanId = generateScanId(
      orderId,
      previousHolderId || "unknown",
      order.buyerId || "buyer",
      "DELIVERY",
    );

    tracking.routeHistory.push({
      scanId: scanId,
      scanFingerprint: deliveryFingerprint, // ✅ Added permanent fingerprint
      fromHolderId: previousHolderId,
      fromHolderType: previousHolderType,
      fromHolderName: previousHolderName,
      toHolderId: order.buyerId || "buyer",
      toHolderType: "BUYER",
      toHolderName: order.buyerName || "Buyer",
      scannedByUserId: loggedInUserId,
      scannedByName: authUser.name || authUser.email,
      location: {
        latitude: order.buyerAddress?.latitude || 0,
        longitude: order.buyerAddress?.longitude || 0,
        address: order.buyerAddress?.address || "Delivery Location",
      },
      transferredAt: now,
      scanType: "DELIVERY", // ✅ Changed from HANDOVER to DELIVERY
    });

    console.log("✅ Route history updated");
    console.log(`   From: ${previousHolderType} (${previousHolderName})`);
    console.log(`   To: BUYER (${order.buyerName || "Buyer"})`);
    console.log(`   Scan ID: ${scanId}`);
    console.log(`   Fingerprint: ${deliveryFingerprint}`);

    tracking.trackingHistory.push({
      status: "delivered",
      holderType: "BUYER",
      holderId: order.buyerId || "buyer",
      holderName: order.buyerName || "Buyer",
      note: "Order delivered successfully using OTP verification",
      createdAt: now,
      scanInfo: {
        scannedByUserId: loggedInUserId,
        scannedByName: authUser.name || authUser.email,
        scannedByType: "RIDER",
        scannedAt: now,
        scanType: "DELIVERY",
      },
    });

    console.log("✅ Tracking history updated");

    tracking.totalRidersInvolved += 1;

    console.log("\n📦 === UPDATING ORDER DOCUMENT ===");

    order.metadata = {
      ...order.metadata,
      isDeliveryOtpUsed: true,
      deliveryOtpVerifiedAt: now,
      deliveredBy: {
        userId: loggedInUserId,
        userType: previousHolderType,
        userName: authUser.name || authUser.email,
        deliveredAt: now,
      },
    };

    console.log("\n💾 === SAVING CHANGES ===");
    console.log("ORDER STATUS BEFORE SAVE:", order.status);
    console.log("TRACKING STATUS BEFORE SAVE:", tracking.currentStatus);

    const allowedOrderStatuses = [
      "created",
      "processing",
      "authorized",
      "captured",
      "failed",
      "cancelled",
      "refunded",
      "cod_confirmed",
    ];

    if (allowedOrderStatuses.includes(order.status)) {
      console.log(`✅ Order status is valid: ${order.status}`);
    } else {
      console.warn(
        `⚠️ WARNING: Order status is ${order.status} - this should NOT be "delivered"!`,
      );
    }

    await tracking.save({ session });
    await order.save({ session });

    console.log("✅ Tracking saved");
    console.log("✅ Order saved");
    console.log(`   Order status remains: ${order.status}`);
    console.log(`   Tracking status is: ${tracking.currentStatus}`);

    await session.commitTransaction();
    session.endSession();

    console.log("✅ Transaction committed successfully");
    console.log("🎉 Delivery completed successfully!");
    console.log("========================================\n");

    return res.status(200).json({
      success: true,
      message: "Order delivered successfully",
      data: {
        orderId: order.orderId,
        trackingId: tracking.trackingId,
        orderStatus: order.status,
        trackingStatus: tracking.currentStatus,
        deliveredAt: now,
        deliveredBy: {
          userId: loggedInUserId,
          userType: previousHolderType,
          userName: authUser.name || authUser.email,
        },
        buyerName: order.buyerName,
        buyerId: order.buyerId,
        previousHolder: {
          userId: releasedOwner?.holderId || previousHolderId,
          userType: releasedOwner?.holderType || previousHolderType,
          userName: releasedOwner?.holderName || previousHolderName,
        },
      },
    });
  } catch (error: any) {
    console.error("\n❌ ========== ERROR ==========");
    console.error("Error in deliverWithOTP:", error);
    console.error("Error stack:", error.stack);
    console.error("================================\n");

    await session.abortTransaction();
    session.endSession();

    return res.status(500).json({
      success: false,
      message: "Failed to process delivery",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ============================================
// API 3: Request New OTP
// ============================================

export const requestNewOTP = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("\n🔐 ========== REQUEST NEW OTP ==========");

    const authUser = (req as any).user;
    const { orderId } = req.body;

    if (!authUser) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await Order.findOne({ orderId }).session(session);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const tracking = await DeliveryTracking.findOne({ orderId }).session(
      session,
    );
    if (!tracking) {
      return res.status(404).json({
        success: false,
        message: "Tracking not found",
      });
    }

    if (tracking.currentHolderId !== authUser._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not the current holder of this parcel",
      });
    }

    let buyerEmail: string | null = null;
    let buyerName: string | null = order.buyerName || null;

    if (order.buyerId) {
      buyerEmail = await getBuyerEmail(order.buyerId);
      if (!buyerName) {
        buyerName = await getBuyerName(order.buyerId);
      }
    }

    const newOTP = generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    order.metadata = {
      ...order.metadata,
      deliveryOtp: newOTP,
      isDeliveryOtpUsed: false,
      otpExpiresAt: expiresAt,
      otpGeneratedAt: new Date(),
      otpGeneratedBy: {
        userId: authUser._id,
        userType: tracking.currentHolderType,
        userName: authUser.name || authUser.email,
      },
      buyerEmail: buyerEmail,
    };

    if (buyerName && !order.buyerName) {
      order.buyerName = buyerName;
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    const finalBuyerEmail =
      buyerEmail || order.buyerEmail || order.metadata?.buyerEmail;
    const finalBuyerName = buyerName || order.buyerName || "Customer";

    if (finalBuyerEmail) {
      try {
        await sendOTPEmail({
          to: finalBuyerEmail,
          name: finalBuyerName,
          otp: newOTP,
          orderId: order.orderId,
          expiresInMinutes: 5,
        });
        console.log(`✅ New OTP email sent to: ${finalBuyerEmail}`);
      } catch (emailError) {
        console.error("❌ Failed to send OTP email:", emailError);
      }
    } else {
      console.warn("⚠️ No buyer email found. OTP not sent.");
    }

    console.log("✅ New OTP generated:", newOTP);
    console.log("   Expires at:", expiresAt);
    console.log("========================================\n");

    return res.status(200).json({
      success: true,
      message: finalBuyerEmail
        ? "New OTP generated and sent successfully"
        : "OTP generated but buyer email not found.",
      data: {
        orderId: order.orderId,
        expiresAt: expiresAt,
        expiresInMinutes: 5,
        buyerEmail: finalBuyerEmail,
        ...(process.env.NODE_ENV === "development" && { otp: newOTP }),
      },
    });
  } catch (error: any) {
    console.error("❌ Error generating OTP:", error);
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({
      success: false,
      message: "Failed to generate OTP",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ============================================
// API 4: Verify Delivery OTP (GET)
// ============================================

export const verifyDeliveryOTP = async (req: Request, res: Response) => {
  try {
    console.log("\n🔐 ========== VERIFY DELIVERY OTP ==========");

    const authUser = (req as any).user;
    const { orderId, otp } = req.query;

    if (!authUser) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!orderId || !otp) {
      return res.status(400).json({
        success: false,
        message: "Order ID and OTP are required",
      });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const tracking = await DeliveryTracking.findOne({ orderId });
    if (!tracking) {
      return res.status(404).json({
        success: false,
        message: "Tracking not found",
      });
    }

    if (tracking.currentHolderId !== authUser._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not the current holder of this parcel",
      });
    }

    const storedOtp = order.metadata?.deliveryOtp;
    const isUsed = order.metadata?.isDeliveryOtpUsed || false;
    const expiresAt = order.metadata?.otpExpiresAt;

    if (!storedOtp) {
      return res.status(404).json({
        success: false,
        message: "No OTP found for this order",
      });
    }

    if (isUsed) {
      return res.status(400).json({
        success: false,
        message: "OTP has already been used",
      });
    }

    if (expiresAt && new Date() > new Date(expiresAt)) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired",
      });
    }

    const isValid = storedOtp.toString() === otp.toString();

    console.log("✅ OTP verification result:", isValid);
    console.log("========================================\n");

    return res.status(200).json({
      success: true,
      data: {
        isValid,
        expiresAt,
        isUsed,
      },
    });
  } catch (error: any) {
    console.error("❌ Error verifying OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
