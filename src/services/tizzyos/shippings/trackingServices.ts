// ============================================================
// COMPLETE UPDATED TrackingService.ts
// ============================================================

import mongoose from "mongoose";
import Order, { IOrder } from "../../../models/tizzyos/shipping/order/order";
import DeliveryTracking, {
  FWSProcessingStage,
} from "../../../models/tizzyos/shipping/order/deliveryTracking";
import IDeliveryTracking from "../../../models/tizzyos/shipping/order/deliveryTracking";
import FWSEmployeeActivity, {
  FWSEmployeeActivityType,
} from "../../../models/tizzyos/fws/employeeActivity";
import jwt from "jsonwebtoken";
import { Employee } from "../../../models/tizzyos/fws/employee";
import FWSWareHouse from "../../../models/tizzyos/fws/fwsWareHouse";
import IFWSWareHouse from "../../../models/tizzyos/fws/fwsWareHouse";
import Shipping from "../../../models/tizzyos/shipping/fws/fwsRegistration";
import ShippingLocation from "../../../models/tizzyos/shipping/fws/fwsRiderLocation";
import SellerLocation from "../../../models/tizzyos/seller/locations/locations";
import SellerApplication from "../../../models/tizzyos/seller/SellerApplication";
import User, { IUser } from "../../../models/tizzygo/auths/User";
import {
  generateTrackingId,
  generateDispatchId,
  addTrackingHistory,
  calculateDistance,
} from "../../../utils/tizzyos/shippings/trackingUtils";

// ============================================================
// INTERFACES
// ============================================================

export interface FWSOrderWithTracking {
  order: IOrder | null;
  tracking: typeof IDeliveryTracking;
  isCurrentOrder: boolean;
}

export interface FWSOrdersResponse {
  success: boolean;
  data: {
    currentOrders: FWSOrderWithTracking[];
    previousOrders: FWSOrderWithTracking[];
    total: number;
    currentCount: number;
    previousCount: number;
  };
  message?: string;
}

export class TrackingService {
  private static async validateSeller(userId: string): Promise<boolean> {
    const seller = await SellerApplication.findOne({
      userId,
      status: "approved",
    });
    if (!seller) throw new Error("Unauthorized: Seller not approved");
    return true;
  }

  static async validateFWSUser(fwsUserId: string) {
    console.log("🔄 Validating FWS User...");

    const fws = await FWSWareHouse.findOne({
      userId: fwsUserId,
      status: "ACTIVE",
    });

    if (!fws) {
      console.error(`❌ FWS not found or not active for userId: ${fwsUserId}`);
      throw new Error("FWS not found or not active");
    }

    console.log("✅ FWS User validated successfully");
    return fws;
  }

  private static async validateShippingPartner(
    userId: string,
    shippingType?: string,
  ): Promise<any> {
    const query: any = {
      userId,
      status: "approved",
      isOnline: true,
      isAvailable: true,
    };
    if (shippingType) query.shippingType = shippingType;
    const shipping = await Shipping.findOne(query);
    if (!shipping) throw new Error(`Shipping partner is not available`);
    if (shipping.orderStats.assigned >= shipping.maxOrdersPerDay) {
      throw new Error(
        `${shipping.shippingType} has reached maximum daily order capacity`,
      );
    }
    const shippingLocation = await ShippingLocation.findOne({ userId });
    if (!shippingLocation || !shippingLocation.isTrackingOn) {
      throw new Error(`${shipping.shippingType} location tracking is OFF`);
    }
    if (
      !shippingLocation.location?.latitude ||
      !shippingLocation.location?.longitude
    ) {
      throw new Error(
        `${shipping.shippingType} current location not available`,
      );
    }
    return { shipping, shippingLocation };
  }

  private static async findNearestAvailableShippingPartner(
    lat: number,
    lng: number,
    shippingType: string,
    excludeIds: string[] = [],
  ): Promise<{ userId: string; shipping: any; distance: number } | null> {
    const allPartners = await Shipping.find({
      shippingType,
      status: "approved",
      isOnline: true,
      isAvailable: true,
      userId: { $nin: excludeIds },
    });
    if (!allPartners.length) return null;

    const partnersWithLocation: Array<{
      userId: string;
      shipping: any;
      location: any;
      distance: number;
    }> = [];
    for (const partner of allPartners) {
      if (partner.orderStats.assigned >= partner.maxOrdersPerDay) continue;
      const location = await ShippingLocation.findOne({
        userId: partner.userId,
        isTrackingOn: true,
        "location.latitude": { $exists: true },
        "location.longitude": { $exists: true },
      });
      if (location?.location) {
        const distance = calculateDistance(
          lat,
          lng,
          location.location.latitude,
          location.location.longitude,
        );
        partnersWithLocation.push({
          userId: String(partner.userId),
          shipping: partner,
          location,
          distance,
        });
      }
    }
    if (!partnersWithLocation.length) return null;
    partnersWithLocation.sort((a, b) => a.distance - b.distance);
    const nearestWithin50km = partnersWithLocation.find(
      (p) => p.distance <= 50,
    );
    if (nearestWithin50km) return nearestWithin50km;
    const nearestWithin100km = partnersWithLocation.find(
      (p) => p.distance <= 100,
    );
    if (nearestWithin100km) return nearestWithin100km;
    return null;
  }

  // ============================================
  // QR VISIBILITY API
  // ============================================

  static async getQRVisibility(
    orderId: string,
    userId: string,
  ): Promise<{
    showQR: boolean;
    holderType?: string;
    holderId?: string;
    reason?: string;
  }> {
    const order = await Order.findOne({ orderId });
    if (!order) throw new Error("Order not found");
    const tracking = await DeliveryTracking.findOne({ orderId });
    if (!tracking) throw new Error("Tracking not found");
    if (tracking.currentStatus === "delivered") {
      return { showQR: false, reason: "Order already delivered" };
    }
    if (tracking.currentHolderId !== userId) {
      return {
        showQR: false,
        reason: `Only current holder (${tracking.currentHolderType}) can view QR code`,
      };
    }
    if (!order.shippingLabel?.qrCodeUrl) {
      return { showQR: false, reason: "QR code not generated yet" };
    }
    return {
      showQR: true,
      holderType: tracking.currentHolderType,
      holderId: tracking.currentHolderId,
    };
  }

  // ============================================
  // ✅ HELPER: Generate Permanent Scan Fingerprint
  // ============================================

  private static generateScanFingerprint(
    orderId: string,
    fromHolderId: string,
    toHolderId: string,
    scanType: "HANDOVER" | "VERIFICATION" | "DISPATCH" | "DELIVERY",
    scannedByUserId: string,
  ): string {
    return `${orderId}_${fromHolderId}_${toHolderId}_${scanType}_${scannedByUserId}`;
  }

  // ============================================
  // ✅ HELPER: Check for Duplicate Scan by Fingerprint
  // ============================================

  private static checkDuplicateScanByFingerprint(
    routeHistory: any[],
    fingerprint: string,
  ): boolean {
    return routeHistory.some((r: any) => r.scanFingerprint === fingerprint);
  }

  // ============================================
  // ✅ HELPER: Check if Assignment Already Accepted
  // ============================================

  private static checkAssignmentAlreadyAccepted(
    pendingAssignment: any,
    assignmentHistory: any[],
    assignmentId: string,
  ): { alreadyAccepted: boolean; message?: string } {
    // Check pendingAssignment
    if (pendingAssignment?.status === "ACCEPTED") {
      return {
        alreadyAccepted: true,
        message: "Assignment already accepted",
      };
    }

    // Check assignmentHistory
    if (assignmentHistory && assignmentHistory.length > 0) {
      const alreadyAccepted = assignmentHistory.some(
        (a: any) => a.assignmentId === assignmentId && a.status === "ACCEPTED",
      );
      if (alreadyAccepted) {
        return {
          alreadyAccepted: true,
          message: "Assignment already accepted (history)",
        };
      }
    }

    return { alreadyAccepted: false };
  }

  // ============================================
  // QR CODE HANDOVER
  // ============================================

  // ============================================
  // QR CODE HANDOVER - COMPLETE FIXED WITH ASSIGNMENT HISTORY
  // ============================================

  static async handoverViaQR(
    token: string,
    scannerUserId: string,
  ): Promise<any> {
    console.log("\n🔐 ========================================");
    console.log("🔐 HANDOVER VIA QR - START");
    console.log("🔐 ========================================");
    console.log(`📌 Scanner User ID: ${scannerUserId}`);
    console.log(`📌 Token: ${token.substring(0, 30)}...`);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // ============================================================
      // STEP 1: Verify and decode JWT
      // ============================================================
      console.log("\n📋 STEP 1: Decoding JWT Token");
      const qrSecret = process.env.QR_SECRET;
      let decodedToken: any;
      try {
        decodedToken = jwt.verify(token, qrSecret as string);
        console.log("✅ JWT Verified Successfully");
        console.log(`   Order ID: ${decodedToken.orderId}`);
        console.log(`   Seller ID: ${decodedToken.sellerId}`);
        console.log(`   Buyer ID: ${decodedToken.buyerId}`);
      } catch (err: any) {
        console.error(`❌ JWT Verification Failed: ${err.message}`);
        throw new Error(`Invalid or expired QR token: ${err.message}`);
      }

      const { orderId, sellerId, buyerId } = decodedToken;

      // ============================================================
      // STEP 2: Fetch Order
      // ============================================================
      console.log("\n📋 STEP 2: Fetching Order");
      const order = await Order.findOne({ orderId }).session(session);
      if (!order) {
        console.error(`❌ Order not found: ${orderId}`);
        throw new Error("Order not found");
      }
      console.log(`✅ Order Found: ${order.orderId}`);
      console.log(`   Fulfillment Type: ${order.fulfillmentType}`);
      console.log(`   Status: ${order.status}`);

      // ============================================================
      // STEP 3: Handle Tracking ID
      // ============================================================
      console.log("\n📋 STEP 3: Handling Tracking ID");
      let trackingId = order.trackingId;
      if (order.fulfillmentType === "FWS" && !trackingId) {
        trackingId = generateTrackingId();
        order.trackingId = trackingId;
        await order.save({ session });
        console.log(`✅ New Tracking ID Generated: ${trackingId}`);
      } else {
        console.log(`✅ Existing Tracking ID: ${trackingId}`);
      }

      if (!trackingId) {
        console.error("❌ Tracking ID not found");
        throw new Error("Tracking ID not found");
      }

      // ============================================================
      // STEP 4: Validate Seller & Buyer
      // ============================================================
      console.log("\n📋 STEP 4: Validating Seller & Buyer");
      const seller = await User.findById(sellerId).session(session);
      if (!seller) {
        console.error(`❌ Seller not found: ${sellerId}`);
        throw new Error("Seller not found");
      }
      console.log(`✅ Seller Validated: ${seller.email || seller.name}`);

      const buyer = await User.findById(buyerId).session(session);
      if (!buyer) {
        console.error(`❌ Buyer not found: ${buyerId}`);
        throw new Error("Buyer not found");
      }
      console.log(`✅ Buyer Validated: ${buyer.email || buyer.name}`);

      // ============================================================
      // STEP 5: Get or Create Tracking
      // ============================================================
      console.log("\n📋 STEP 5: Getting/Creating Tracking");
      let tracking = await DeliveryTracking.findOne({ orderId }).session(
        session,
      );

      if (!tracking) {
        console.log("⚠️ No tracking found, creating new");
        tracking = new DeliveryTracking({
          orderId,
          trackingId,
          currentStatus: "created",
          currentHolderType: "SELLER",
          currentHolderId: sellerId,
          currentHolderName: seller.name || "Seller",
          routeHistory: [],
          qrOwnershipHistory: [
            {
              holderId: sellerId,
              holderType: "SELLER",
              holderName: seller.name || "Seller",
              receivedAt: new Date(),
              releasedAt: null,
            },
          ],
          trackingHistory: [],
        });
        await tracking.save({ session });
        console.log("✅ New tracking created");
      } else {
        console.log("✅ Existing tracking found");
      }

      console.log(`   Current Status: ${tracking.currentStatus}`);
      console.log(
        `   Current Holder: ${tracking.currentHolderType} (${tracking.currentHolderId})`,
      );

      // ============================================================
      // STEP 6: Verify Tracking ID Match
      // ============================================================
      console.log("\n📋 STEP 6: Verifying Tracking ID Match");
      if (order.trackingId !== tracking.trackingId) {
        console.error(
          `❌ Tracking ID Mismatch: Order=${order.trackingId}, Tracking=${tracking.trackingId}`,
        );
        throw new Error(
          `Tracking ID mismatch between Order (${order.trackingId}) and DeliveryTracking (${tracking.trackingId})`,
        );
      }
      console.log(`✅ Tracking ID Match Verified: ${tracking.trackingId}`);

      // ============================================================
      // STEP 7: Validate Order Not Delivered
      // ============================================================
      console.log("\n📋 STEP 7: Validating Order Not Delivered");
      if (tracking.currentStatus === "delivered") {
        console.error("❌ Order already delivered");
        throw new Error("Order already delivered");
      }
      console.log(`✅ Order Status: ${tracking.currentStatus} (Not Delivered)`);

      // ============================================================
      // STEP 8: Detect Handover Target
      // ============================================================
      console.log("\n📋 STEP 8: Detecting Handover Target");
      const target = await this.detectHandoverTarget(
        scannerUserId,
        orderId,
        session,
      );
      if (!target || !target.toHolderType) {
        console.error("❌ Scanner user not authorized for handover");
        throw new Error("Scanner user not authorized for handover");
      }
      console.log(`✅ Target Detected:`);
      console.log(`   Type: ${target.toHolderType}`);
      console.log(`   ID: ${target.toHolderId}`);
      console.log(`   Name: ${target.toHolderName}`);
      console.log(`   Scan Type: ${target.scanType}`);

      // ============================================================
      // STEP 9: ✅ ONLY ALLOW HANDOVER - BLOCK VERIFICATION
      // ============================================================
      const isVerification = target.scanType === "VERIFICATION";

      if (isVerification) {
        console.error("❌ VERIFICATION NOT ALLOWED IN HANDOVER API!");
        console.error(
          "   Please use verifyQRAndMarkReadyForDispatch() API for verification",
        );
        await session.abortTransaction();
        session.endSession();
        throw new Error(
          "Verification is not allowed in handover API. Please use verifyQRAndMarkReadyForDispatch() API.",
        );
      }

      console.log(`\n📋 STEP 9: Scan Type = HANDOVER (Verified)`);

      // Store the status BEFORE any changes
      const statusBefore = tracking.currentStatus;
      console.log(`   Status Before: ${statusBefore}`);

      // ============================================================
      // STEP 10: Prevent Self Handover
      // ============================================================
      console.log("\n📋 STEP 10: Checking Self Handover");
      const currentHolderId = tracking.currentHolderId?.toString();
      const targetHolderId = target.toHolderId?.toString();

      if (currentHolderId === targetHolderId) {
        console.error(
          `❌ Self handover detected: ${currentHolderId} -> ${targetHolderId}`,
        );
        throw new Error("Cannot handover to yourself");
      } else {
        console.log(
          `✅ Different holders: ${currentHolderId} != ${targetHolderId}`,
        );
      }

      // ============================================================
      // STEP 11: Check Active QR Ownership
      // ============================================================
      console.log("\n📋 STEP 11: Checking Active QR Ownership");
      const activeQREntry = tracking.qrOwnershipHistory.find(
        (q: any) => q.releasedAt === null,
      );

      if (!activeQREntry) {
        console.error("❌ No active QR ownership found");
        throw new Error(
          `No active QR ownership found. Cannot perform handover.`,
        );
      }
      console.log(
        `✅ Active QR Owner: ${activeQREntry?.holderType} (${activeQREntry?.holderId})`,
      );

      // ============================================================
      // STEP 12: Validate Flow Based on Fulfillment Type
      // ============================================================
      console.log("\n📋 STEP 12: Validating Handover Flow");
      const currentType = tracking.currentHolderType;
      const targetType = target.toHolderType;

      let validFlows: Record<string, string[]> = {};

      if (order.fulfillmentType === "SELLER") {
        validFlows = {
          SELLER: ["RIDER", "TRUCK", "FWS"],
          RIDER: ["FWS"],
          TRUCK: ["FWS"],
          FWS: ["RIDER", "TRUCK"],
        };
      } else if (order.fulfillmentType === "FWS") {
        validFlows = {
          SELLER: ["FWS"],
          FWS: ["RIDER", "TRUCK"],
          RIDER: ["FWS", "TRUCK"],
          TRUCK: ["FWS", "RIDER"],
        };
      } else {
        console.error(
          `❌ Unsupported fulfillment type: ${order.fulfillmentType}`,
        );
        throw new Error(
          `Unsupported fulfillment type: ${order.fulfillmentType}`,
        );
      }

      const allowedTargets = validFlows[currentType];
      if (!allowedTargets || !allowedTargets.includes(targetType)) {
        console.error(`❌ Invalid flow: ${currentType} -> ${targetType}`);
        console.log(`   Allowed: ${allowedTargets?.join(", ") || "none"}`);
        throw new Error(
          `Invalid handover: ${currentType} → ${targetType} is not allowed for ${order.fulfillmentType} fulfillment. ` +
            `Allowed: ${validFlows[currentType]?.join(", ") || "none"}`,
        );
      }
      console.log(`✅ Flow Validated: ${currentType} -> ${targetType}`);

      // ============================================================
      // STEP 13: Fetch Scanner User
      // ============================================================
      console.log("\n📋 STEP 13: Fetching Scanner User");
      const scannerUser = await User.findById(scannerUserId).select("name");
      if (!scannerUser) {
        console.error(`❌ Scanner user not found: ${scannerUserId}`);
        throw new Error("Scanner user not found");
      }
      console.log(`✅ Scanner User: ${scannerUser.name}`);

      // ============================================================
      // STEP 14: Store Previous Holder
      // ============================================================
      const previousHolder = {
        type: tracking.currentHolderType,
        id: tracking.currentHolderId?.toString(),
        name: tracking.currentHolderName,
      };
      console.log(`\n📋 STEP 14: Previous Holder`);
      console.log(`   Type: ${previousHolder.type}`);
      console.log(`   ID: ${previousHolder.id}`);
      console.log(`   Name: ${previousHolder.name}`);

      // ============================================================
      // ✅ STEP 15: DUPLICATE HANDOVER DETECTION
      // ============================================================
      console.log("\n📋 STEP 15: ⚠️ DUPLICATE HANDOVER DETECTION");

      const handoverFingerprint = this.generateScanFingerprint(
        orderId,
        previousHolder.id || "unknown",
        target.toHolderId || "unknown",
        "HANDOVER",
        scannerUserId,
      );

      console.log(
        `   🔍 Checking HANDOVER fingerprint: ${handoverFingerprint}`,
      );

      // Check routeHistory for duplicate handover
      if (
        this.checkDuplicateScanByFingerprint(
          tracking.routeHistory,
          handoverFingerprint,
        )
      ) {
        console.error("❌ DUPLICATE HANDOVER DETECTED!");

        await session.abortTransaction();
        session.endSession();

        const error = new Error("Duplicate Scan Not Allowed");
        (error as any).statusCode = 409;
        (error as any).response = {
          success: false,
          duplicate: true,
          code: "DUPLICATE_SCAN",
          message: "Duplicate Scan Not Allowed",
          details: "This QR has already been scanned for this handover.",
        };
        throw error;
      }

      // ALSO check trackingHistory
      const existingHandoverHistory = tracking.trackingHistory.some(
        (entry: any) =>
          entry.status === "in_transit" &&
          entry.holderId === target.toHolderId &&
          entry.scanInfo?.scannedByUserId === scannerUserId,
      );

      if (existingHandoverHistory) {
        console.error("❌ DUPLICATE HANDOVER DETECTED in trackingHistory!");

        await session.abortTransaction();
        session.endSession();

        const error = new Error("Duplicate Scan Not Allowed");
        (error as any).statusCode = 409;
        (error as any).response = {
          success: false,
          duplicate: true,
          code: "DUPLICATE_SCAN",
          message: "Duplicate Scan Not Allowed",
          details: "This QR has already been scanned for this handover.",
        };
        throw error;
      }

      console.log("   ✅ No duplicate handover found");
      (target as any).scanFingerprint = handoverFingerprint;

      // ============================================================
      // STEP 16: Transfer Ownership (HANDOVER ONLY)
      // ============================================================
      console.log("\n📋 STEP 16: Transferring Ownership");

      // Release current QR owner
      const currentQRIndex = tracking.qrOwnershipHistory.findIndex(
        (q: any) =>
          q.holderId?.toString() === tracking.currentHolderId?.toString() &&
          !q.releasedAt,
      );

      if (currentQRIndex !== -1) {
        tracking.qrOwnershipHistory[currentQRIndex].releasedAt = new Date();
        console.log(`✅ Released QR for: ${tracking.currentHolderId}`);
      }

      // Create new QR ownership entry for target
      tracking.qrOwnershipHistory.push({
        holderId: target.toHolderId,
        holderType: target.toHolderType,
        holderName: target.toHolderName,
        receivedAt: new Date(),
        releasedAt: null,
      });
      console.log(
        `✅ Created QR for: ${target.toHolderType} (${target.toHolderId})`,
      );

      // Update currentHolder for HANDOVER
      tracking.currentHolderType = target.toHolderType;
      tracking.currentHolderId = target.toHolderId;
      tracking.currentHolderName = target.toHolderName;
      console.log(
        `✅ Updated currentHolder: ${target.toHolderType} (${target.toHolderId})`,
      );

      // Update status for HANDOVER
      if (target.toHolderType === "FWS") {
        tracking.currentStatus = "received_at_fws";
        console.log(`✅ Status updated: received_at_fws`);
      } else if (
        target.toHolderType === "RIDER" ||
        target.toHolderType === "TRUCK"
      ) {
        tracking.currentStatus = "in_transit";
        console.log(`✅ Status updated: in_transit`);
      }

      // ============================================================
      // STEP 17: Add Route History
      // ============================================================
      console.log("\n📋 STEP 17: Adding Route History");

      // Check rider/truck count
      let riderAlreadyCounted = false;
      let truckAlreadyCounted = false;

      if (target.toHolderType === "RIDER") {
        riderAlreadyCounted = tracking.routeHistory.some(
          (r: any) =>
            r.toHolderType === "RIDER" &&
            r.toHolderId?.toString() === target.toHolderId?.toString(),
        );
        if (!riderAlreadyCounted) {
          tracking.totalRidersInvolved += 1;
          console.log(`✅ New RIDER counted: ${target.toHolderName}`);
        } else {
          console.log(`   RIDER already counted: ${target.toHolderName}`);
        }
      } else if (target.toHolderType === "TRUCK") {
        truckAlreadyCounted = tracking.routeHistory.some(
          (r: any) =>
            r.toHolderType === "TRUCK" &&
            r.toHolderId?.toString() === target.toHolderId?.toString(),
        );
        if (!truckAlreadyCounted) {
          tracking.totalTrucksInvolved += 1;
          console.log(`✅ New TRUCK counted: ${target.toHolderName}`);
        } else {
          console.log(`   TRUCK already counted: ${target.toHolderName}`);
        }
      }

      // Push to routeHistory with scanId AND scanFingerprint
      const scanId = `HANDOVER_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      tracking.routeHistory.push({
        scanId: scanId,
        scanFingerprint: (target as any).scanFingerprint,
        fromHolderId: previousHolder.id,
        fromHolderType: previousHolder.type,
        fromHolderName: previousHolder.name,
        toHolderId: target.toHolderId,
        toHolderType: target.toHolderType,
        toHolderName: target.toHolderName,
        scannedByUserId: scannerUserId,
        scannedByName: scannerUser?.name,
        location: {
          latitude: target.location?.latitude || 0,
          longitude: target.location?.longitude || 0,
          address: target.location?.address,
        },
        transferredAt: new Date(),
        scanType: "HANDOVER",
      });

      console.log(`✅ Route History Added`);
      console.log(`   From: ${previousHolder.type} (${previousHolder.name})`);
      console.log(`   To: ${target.toHolderType} (${target.toHolderName})`);
      console.log(`   Scan ID: ${scanId}`);
      console.log(`   Fingerprint: ${(target as any).scanFingerprint}`);

      // ============================================================
      // STEP 18: Update Location
      // ============================================================
      if (target.location) {
        tracking.currentLocation = {
          address: target.location.address,
          latitude: target.location.latitude,
          longitude: target.location.longitude,
          updatedAt: new Date(),
        };
        console.log(`✅ Location Updated`);
      }

      // ============================================================
      // STEP 19: FWS-specific Updates
      // ============================================================
      if (target.toHolderType === "FWS") {
        console.log("\n📋 STEP 19: FWS-specific Updates");

        // REAL HANDOVER TO FWS
        tracking.currentFWS = {
          userId: target.toHolderId,
          fwsCode: target.fwsCode,
          fwsName: target.toHolderName,
          city: target.city,
          address: target.location?.address,
          latitude: target.location?.latitude,
          longitude: target.location?.longitude,
          processingStage: FWSProcessingStage.RECEIVED,
          updatedAt: new Date(),
        };

        tracking.currentStatus = "received_at_fws";
        tracking.totalFWSVisited += 1;
        tracking.currentShipping = null;
        console.log(
          `✅ FWS Updated: ${target.toHolderName} (${target.fwsCode})`,
        );
        console.log(`✅ FWS Processing Stage: RECEIVED`);

        // ✅ FIX: Move pendingAssignment to history and CLEAR IT
        if (tracking.pendingAssignment) {
          console.log("📋 Moving pendingAssignment to history and clearing...");
          console.log(
            `   Assignment ID: ${tracking.pendingAssignment.assignmentId}`,
          );
          console.log(
            `   Assignee Type: ${tracking.pendingAssignment.assigneeType}`,
          );
          console.log(`   Status: ${tracking.pendingAssignment.status}`);

          if (!tracking.assignmentHistory) {
            tracking.assignmentHistory = [];
          }

          // Check if already in history to avoid duplicates
          const existingInHistory = tracking.assignmentHistory.some(
            (a: any) =>
              a.assignmentId === tracking.pendingAssignment.assignmentId,
          );

          if (!existingInHistory) {
            const historyEntry = {
              assignmentId: tracking.pendingAssignment.assignmentId,
              assigneeId: tracking.pendingAssignment.assigneeId,
              assigneeType: tracking.pendingAssignment.assigneeType,
              assignedBy: tracking.pendingAssignment.assignedBy,
              assignedByType: tracking.pendingAssignment.assignedByType,
              assignedAt: tracking.pendingAssignment.assignedAt,
              assignmentType: tracking.pendingAssignment.assignmentType,
              distance: tracking.pendingAssignment.distance || 0,
              status: "COMPLETED" as const,
              acceptedAt: tracking.pendingAssignment.acceptedAt || new Date(),
              completedAt: new Date(),
            };

            tracking.assignmentHistory.push(historyEntry);
            console.log(
              `✅ Assignment moved to history with status: COMPLETED`,
            );
          } else {
            console.log(`⚠️ Assignment already in history, skipping duplicate`);
          }

          // ✅ CLEAR pendingAssignment so FWS can assign new one
          tracking.pendingAssignment = null;
          console.log(`✅ pendingAssignment cleared successfully`);
        } else {
          console.log(`ℹ️ No pendingAssignment to clear`);
        }

        // Create FWSEmployeeActivity
        const activity = new FWSEmployeeActivity({
          employeeUserId: scannerUserId,
          employeeName: scannerUser.name,
          fwsUserId: target.toHolderId,
          fwsCode: target.fwsCode,
          activityType: FWSEmployeeActivityType.RECEIVED_AT_FWS,
          orderId: order.orderId,
          trackingId: tracking.trackingId,
          activityDate: new Date(),
        });

        await activity.save({ session });
        console.log(`✅ Activity Created: RECEIVED_AT_FWS`);
      }

      // ============================================================
      // STEP 20: RIDER/TRUCK-specific Updates
      // ============================================================
      if (target.toHolderType === "RIDER" || target.toHolderType === "TRUCK") {
        console.log("\n📋 STEP 20: RIDER/TRUCK-specific Updates");

        tracking.currentShipping = {
          shippingUserId: new mongoose.Types.ObjectId(target.toHolderId),
          shippingName: target.toHolderName,
          latitude: target.location?.latitude,
          longitude: target.location?.longitude,
          shippingType: target.toHolderType,
          updatedAt: new Date(),
        };

        tracking.currentStatus = "in_transit";
        tracking.currentFWS = null;
        console.log(
          `✅ Shipping Updated: ${target.toHolderType} (${target.toHolderName})`,
        );
      }

      // ============================================================
      // STEP 21: Add Tracking History
      // ============================================================
      console.log("\n📋 STEP 21: Adding Tracking History");

      let trackingNote = "";
      let fwsStage = undefined;

      if (target.toHolderType === "FWS") {
        trackingNote = `Parcel received at FWS warehouse: ${target.toHolderName} (${target.fwsCode})`;
        fwsStage = FWSProcessingStage.RECEIVED;
      } else if (target.toHolderType === "RIDER") {
        trackingNote = `Parcel handed over to RIDER: ${target.toHolderName}`;
      } else if (target.toHolderType === "TRUCK") {
        trackingNote = `Parcel handed over to TRUCK: ${target.toHolderName}`;
      } else {
        trackingNote = `QR handover to ${target.toHolderType} completed`;
      }

      const historyEntry: any = {
        status: tracking.currentStatus,
        holderType: target.toHolderType,
        holderId: target.toHolderId,
        holderName: target.toHolderName,
        note: trackingNote,
        scanInfo: {
          scannedByUserId: scannerUserId,
          scannedByName: scannerUser?.name,
          scannedByType: target.toHolderType,
          scannedAt: new Date(),
          scanType: "HANDOVER",
        },
        fwsProcessingStage: fwsStage,
      };

      tracking.trackingHistory = addTrackingHistory(
        tracking.trackingHistory,
        historyEntry,
      );
      console.log(`✅ Tracking History Added: ${trackingNote}`);

      // ============================================================
      // STEP 22: Save Tracking
      // ============================================================
      console.log("\n📋 STEP 22: Saving Tracking");
      await tracking.save({ session });
      await session.commitTransaction();
      console.log("✅ Tracking Saved Successfully");

      // ============================================================
      // STEP 23: Return Response
      // ============================================================
      const activeOwner = tracking.qrOwnershipHistory.find(
        (q: any) => !q.releasedAt,
      );

      console.log("\n📋 STEP 23: Return Response");
      console.log(`   Success: true`);
      console.log(`   Status After: ${tracking.currentStatus}`);
      console.log(
        `   Active Owner: ${activeOwner?.holderType} (${activeOwner?.holderId})`,
      );
      console.log(
        `   Assignment History Length: ${tracking.assignmentHistory?.length || 0}`,
      );
      console.log(
        `   Pending Assignment: ${tracking.pendingAssignment ? "Exists" : "Cleared"}`,
      );
      console.log("\n🔐 ========================================");
      console.log("🔐 HANDOVER VIA QR - COMPLETE ✅");
      console.log("🔐 ========================================\n");

      return {
        success: true,
        orderId,
        trackingId: tracking.trackingId,
        fulfillmentType: order.fulfillmentType,
        scanType: "HANDOVER",
        isVerification: false,
        statusBefore: statusBefore,
        statusAfter: tracking.currentStatus,
        fromHolder: {
          type: previousHolder.type,
          id: previousHolder.id,
          name: previousHolder.name,
        },
        toHolder: {
          type: target.toHolderType,
          id: target.toHolderId,
          name: target.toHolderName,
        },
        currentStatus: tracking.currentStatus,
        activeQROwner: activeOwner
          ? {
              holderType: activeOwner.holderType,
              holderId: activeOwner.holderId,
              holderName: activeOwner.holderName,
              receivedAt: activeOwner.receivedAt,
            }
          : null,
        routeHistoryCreated: true,
        processingStage:
          target.toHolderType === "FWS"
            ? FWSProcessingStage.RECEIVED
            : undefined,
        assignmentHistory: tracking.assignmentHistory || [],
        pendingAssignmentCleared: target.toHolderType === "FWS",
        message: `Successfully handed over from ${previousHolder.type} to ${target.toHolderType}. Status updated to "${tracking.currentStatus}".`,
      };
    } catch (error: any) {
      console.error("\n❌ ========================================");
      console.error("❌ HANDOVER VIA QR - ERROR");
      console.error("❌ ========================================");
      console.error(error);
      console.error("❌ ========================================\n");

      if (error.response && error.response.duplicate === true) {
        throw error;
      }

      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
  // ============================================
  // detectHandoverTarget() - WITH EMPLOYEE MODEL
  // ============================================
  private static async detectHandoverTarget(
    scannerUserId: string,
    orderId: string,
    session?: mongoose.ClientSession,
  ): Promise<any> {
    console.log("================================");
    console.log("🔍 DETECT HANDOVER TARGET");
    console.log("================================");
    console.log("Scanner User ID:", scannerUserId);
    console.log("Order ID:", orderId);

    // 1. Fetch scanner user from User model with roles
    const scannerUser = await User.findById(scannerUserId)
      .select("name roles")
      .session(session ?? null);

    console.log("Scanner User:", scannerUser);
    console.log("User Roles:", scannerUser?.roles);

    // 2. Check if user exists
    if (!scannerUser) {
      console.log("❌ Scanner user not found");
      throw new Error("Scanner user not found");
    }

    // 3. Get the user's role (supports both string and array)
    const userRoles = Array.isArray(scannerUser.roles)
      ? scannerUser.roles
      : [scannerUser.roles];

    console.log("User Roles Array:", userRoles);

    let toHolderId = "";
    let toHolderType = "";
    let toHolderName = "";
    let fwsCode = "";
    let city = "";
    let location = null;
    let scanType = "HANDOVER"; // Default

    // 4. Check if user has SHIPPING role (RIDER or TRUCK)
    if (userRoles.includes("SHIPPING")) {
      console.log("🚚 SHIPPING ROLE DETECTED");

      const shipping = await Shipping.findOne({
        userId: scannerUserId,
        status: "approved",
      }).session(session ?? null);

      if (!shipping) {
        console.log("❌ Shipping profile not found or not approved");
        throw new Error("Shipping profile not found or not approved");
      }

      console.log("🚚 SHIPPING PROFILE FOUND");
      console.log("Shipping Type:", shipping.shippingType);
      console.log("Shipping Data:", shipping);

      // Validate shipping type
      if (
        shipping.shippingType !== "RIDER" &&
        shipping.shippingType !== "TRUCK"
      ) {
        throw new Error(
          `Invalid shipping type: ${shipping.shippingType}. Must be RIDER or TRUCK`,
        );
      }

      toHolderType = shipping.shippingType; // "RIDER" or "TRUCK"
      toHolderId = shipping.userId.toString();
      toHolderName = shipping.name;

      const shippingLocation = await ShippingLocation.findOne({
        userId: scannerUserId,
      }).session(session ?? null);

      if (shippingLocation?.location) {
        location = {
          latitude: shippingLocation.location.latitude,
          longitude: shippingLocation.location.longitude,
          address: shippingLocation.location.address,
        };
      }

      console.log("✅ HANDOVER TARGET: SHIPPING");
      console.log("Target Type:", toHolderType);
      console.log("Target Name:", toHolderName);
      console.log(
        "Scan Type: HANDOVER (shipping personnel always do handover)",
      );
      console.log("================================");

      return {
        toHolderId,
        toHolderType,
        toHolderName,
        fwsCode,
        city,
        location,
        scanType: "HANDOVER",
      };
    }

    // 5. Check if user has FWS role
    if (userRoles.includes("FWS")) {
      console.log("🏢 FWS ROLE DETECTED");

      // STEP 1: Check if user is an EMPLOYEE first
      console.log("🔍 Checking if user is an FWS Employee...");

      const employee = await Employee.findOne({
        userId: scannerUserId,
        isActive: true,
        approvalStatus: "APPROVED",
      }).session(session ?? null);

      let fws = null;
      let isOwner = false;
      let isEmployee = false;
      let employeeRole = "";

      if (employee) {
        console.log("✅ EMPLOYEE FOUND!");
        console.log("Employee Name:", employee.name);
        console.log("Employee Role:", employee.role);
        console.log("Employee FWS Code:", employee.fwsCode);
        console.log("Employee isActive:", employee.isActive);
        isEmployee = true;
        employeeRole = employee.role;

        // Find the FWS warehouse using employee's fwsCode
        fws = await FWSWareHouse.findOne({
          fwsCode: employee.fwsCode,
          status: "ACTIVE",
        }).session(session ?? null);

        if (!fws) {
          console.log(
            "❌ FWS warehouse not found for fwsCode:",
            employee.fwsCode,
          );
          throw new Error(
            `FWS warehouse not found for code: ${employee.fwsCode}`,
          );
        }

        console.log("✅ FWS WAREHOUSE FOUND via Employee!");
        console.log("FWS Name:", fws.name);
        console.log("FWS Code:", fws.fwsCode);
        console.log("FWS User ID:", fws.userId);
      } else {
        // STEP 2: If not employee, check if user is OWNER
        console.log(
          "🔍 User is not an employee. Checking if user is FWS Owner...",
        );

        fws = await FWSWareHouse.findOne({
          userId: scannerUserId,
          status: "ACTIVE",
        }).session(session ?? null);

        if (fws) {
          isOwner = true;
          console.log("✅ FWS OWNER FOUND!");
          console.log("FWS Name:", fws.name);
          console.log("FWS Code:", fws.fwsCode);
          console.log("FWS User ID:", fws.userId);
        } else {
          console.log("❌ User is neither FWS Employee nor Owner");
          throw new Error("User is not authorized as FWS employee or owner");
        }
      }

      // At this point, we have fws and user is authorized
      console.log("🏢 FWS AUTHORIZED USER");
      console.log("Is Owner:", isOwner);
      console.log("Is Employee:", isEmployee);
      if (isEmployee) {
        console.log("Employee Role:", employeeRole);
      }
      console.log("FWS Name:", fws.name);
      console.log("FWS Code:", fws.fwsCode);

      // ScanType based on PARCEL STATE, not role
      console.log("\n🔍 Determining scan type based on parcel state...");

      // Load DeliveryTracking to check current state
      const tracking = await DeliveryTracking.findOne({ orderId }).session(
        session ?? null,
      );

      if (!tracking) {
        console.log("❌ DeliveryTracking not found for order:", orderId);
        throw new Error("DeliveryTracking not found for this order");
      }

      console.log("📊 Current Parcel State:");
      console.log("  Current Holder Type:", tracking.currentHolderType);
      console.log("  Current Holder ID:", tracking.currentHolderId);
      console.log("  Current Status:", tracking.currentStatus);
      console.log("  Current FWS:", tracking.currentFWS);

      // RULE 1: If parcel is with RIDER or TRUCK, FWS employee must HANDOVER (receive)
      if (
        tracking.currentHolderType === "RIDER" ||
        tracking.currentHolderType === "TRUCK"
      ) {
        console.log(`📦 Parcel is with ${tracking.currentHolderType}`);
        console.log("✅ FWS employee will RECEIVE parcel - HANDOVER scan");
        scanType = "HANDOVER";
        toHolderType = "FWS";
        toHolderId = fws.userId.toString();
        toHolderName = fws.name;
        fwsCode = fws.fwsCode;
        city = fws.city;
        location = {
          latitude: fws.latitude,
          longitude: fws.longitude,
          address: fws.address,
        };

        console.log("✅ HANDOVER TARGET: FWS (Receiving from RIDER/TRUCK)");
        console.log("Target Type:", toHolderType);
        console.log("Target Name:", toHolderName);
        console.log("FWS Code:", fwsCode);
        console.log("Scan Type:", scanType);
        console.log("================================");

        return {
          toHolderId,
          toHolderType,
          toHolderName,
          fwsCode,
          city,
          location,
          scanType,
        };
      }

      // RULE 2: If parcel is already with FWS, it's a VERIFICATION scan
      if (tracking.currentHolderType === "FWS") {
        console.log("📦 Parcel is already with FWS");

        // Verify that this FWS employee belongs to the SAME FWS where parcel is
        const currentFWSUserId = tracking.currentFWS?.userId?.toString();
        const scanningFWSUserId = fws.userId.toString();

        console.log("  Current FWS User ID:", currentFWSUserId);
        console.log("  Scanning FWS User ID:", scanningFWSUserId);
        console.log("  Match:", currentFWSUserId === scanningFWSUserId);

        if (currentFWSUserId !== scanningFWSUserId) {
          console.error("❌ Parcel is at a DIFFERENT FWS warehouse!");
          console.error(`  Parcel at FWS: ${tracking.currentFWS?.fwsCode}`);
          console.error(`  Scanning FWS: ${fws.fwsCode}`);
          throw new Error(
            `Parcel is currently at FWS warehouse ${tracking.currentFWS?.fwsCode || "unknown"}, ` +
              `but you are scanning from ${fws.fwsCode}. Only the FWS warehouse holding the parcel can verify it.`,
          );
        }

        console.log("✅ VERIFICATION scan - Parcel already at this FWS");
        scanType = "VERIFICATION";

        toHolderType = "FWS";
        toHolderId = fws.userId.toString();
        toHolderName = fws.name;
        fwsCode = fws.fwsCode;
        city = fws.city;
        location = {
          latitude: fws.latitude,
          longitude: fws.longitude,
          address: fws.address,
        };

        console.log("📷 VERIFICATION TARGET: FWS");
        console.log("Target Type:", toHolderType);
        console.log("Target Name:", toHolderName);
        console.log("FWS Code:", fwsCode);
        console.log("Scan Type:", scanType);
        console.log("Note: Ownership remains with FWS");
        console.log("================================");

        return {
          toHolderId,
          toHolderType,
          toHolderName,
          fwsCode,
          city,
          location,
          scanType,
        };
      }

      // RULE 3: If parcel is with SELLER (initial state)
      if (tracking.currentHolderType === "SELLER") {
        console.log("📦 Parcel is with SELLER");
        console.log("✅ FWS employee can receive from SELLER - HANDOVER scan");
        scanType = "HANDOVER";
        toHolderType = "FWS";
        toHolderId = fws.userId.toString();
        toHolderName = fws.name;
        fwsCode = fws.fwsCode;
        city = fws.city;
        location = {
          latitude: fws.latitude,
          longitude: fws.longitude,
          address: fws.address,
        };

        console.log("✅ HANDOVER TARGET: FWS (Receiving from SELLER)");
        console.log("Target Type:", toHolderType);
        console.log("Target Name:", toHolderName);
        console.log("FWS Code:", fwsCode);
        console.log("Scan Type:", scanType);
        console.log("================================");

        return {
          toHolderId,
          toHolderType,
          toHolderName,
          fwsCode,
          city,
          location,
          scanType,
        };
      }

      // Fallback: If current holder is something else
      console.log(
        `⚠️ Unknown currentHolderType: ${tracking.currentHolderType}`,
      );
      console.log("Defaulting to VERIFICATION (safe option)");
      scanType = "VERIFICATION";
      toHolderType = "FWS";
      toHolderId = fws.userId.toString();
      toHolderName = fws.name;
      fwsCode = fws.fwsCode;
      city = fws.city;
      location = {
        latitude: fws.latitude,
        longitude: fws.longitude,
        address: fws.address,
      };

      console.log("📷 VERIFICATION TARGET: FWS (Fallback)");
      console.log("Scan Type:", scanType);
      console.log("================================");

      return {
        toHolderId,
        toHolderType,
        toHolderName,
        fwsCode,
        city,
        location,
        scanType,
      };
    }

    // 6. No valid role found
    console.log("❌ User role not authorized:", scannerUser.roles);
    console.log("================================");

    throw new Error(
      `Scanner user with role "${scannerUser.roles}" is not authorized for handover. Allowed roles: SHIPPING, FWS`,
    );
  }

  // ============================================
  // API 1: SELLER ACCEPTS ORDER
  // ============================================

  static async sellerAcceptOrder(orderId: string, sellerId: string) {
    await this.validateSeller(sellerId);
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await Order.findOne({ orderId, sellerId }).session(session);
      if (!order) throw new Error("Order not found or unauthorized");

      let tracking = await DeliveryTracking.findOne({ orderId }).session(
        session,
      );
      const alreadyAccepted = tracking?.trackingHistory?.some(
        (item: any) =>
          item.holderType === "SELLER" &&
          item.status === "waiting_for_assignment",
      );
      if (alreadyAccepted) throw new Error("Order already accepted by seller");

      const sellerName = order.sellerName || "Seller";
      if (tracking) {
        tracking.currentStatus = "waiting_for_assignment";
        tracking.currentHolderType = "SELLER";
        tracking.currentHolderId = sellerId;
        tracking.currentHolderName = sellerName;
        tracking.qrOwnershipHistory.push({
          holderId: sellerId,
          holderType: "SELLER",
          holderName: sellerName,
          receivedAt: new Date(),
          releasedAt: null,
        });
        tracking.trackingHistory = addTrackingHistory(
          tracking.trackingHistory,
          {
            status: "waiting_for_assignment",
            holderType: "SELLER",
            holderId: sellerId,
            holderName: sellerName,
            note: "Seller accepted order. Ready for assignment.",
          },
        );
        await tracking.save({ session });
      } else {
        tracking = new DeliveryTracking({
          orderId,
          fulfillmentType: order.fulfillmentType,
          startLocation: {
            address: order.sellerAddress.address,
            latitude: order.sellerAddress.latitude,
            longitude: order.sellerAddress.longitude,
          },
          destinationLocation: {
            address: order.buyerAddress.address,
            latitude: order.buyerAddress.latitude,
            longitude: order.buyerAddress.longitude,
          },
          currentHolderType: "SELLER",
          currentHolderId: sellerId,
          currentHolderName: sellerName,
          currentStatus: "waiting_for_assignment",
          qrOwnershipHistory: [
            {
              holderId: sellerId,
              holderType: "SELLER",
              holderName: sellerName,
              receivedAt: new Date(),
              releasedAt: null,
            },
          ],
          trackingHistory: addTrackingHistory([], {
            status: "waiting_for_assignment",
            holderType: "SELLER",
            holderId: sellerId,
            holderName: sellerName,
            note: "Seller accepted order. Ready for assignment.",
          }),
        });
        await tracking.save({ session });
      }
      await session.commitTransaction();
      return {
        orderId,
        sellerId,
        sellerName,
        status: "waiting_for_assignment",
        message: "Order accepted successfully",
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // ============================================
  // API 2: SELLER Intransit TO FWS
  // ============================================

  static async intransitToFWS(orderId: string, sellerId: string) {
    await this.validateSeller(sellerId);
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const order = await Order.findOne({ orderId, sellerId }).session(session);
      if (!order) throw new Error("Order not found or unauthorized");
      if (order.fulfillmentType !== "FWS")
        throw new Error("Order not for FWS fulfillment");

      // Handle trackingId for FWS
      let trackingId = order.trackingId;
      if (!trackingId) {
        trackingId = generateTrackingId();
        order.trackingId = trackingId;
        await order.save({ session });
      }

      let tracking = await DeliveryTracking.findOne({ orderId }).session(
        session,
      );

      if (!tracking) {
        tracking = new DeliveryTracking({
          orderId,
          trackingId,
          currentStatus: "created",
          currentHolderType: "SELLER",
          currentHolderId: sellerId,
          currentHolderName: order.sellerName || "Seller",
          routeHistory: [],
          qrOwnershipHistory: [
            {
              holderId: sellerId,
              holderType: "SELLER",
              holderName: order.sellerName || "Seller",
              receivedAt: new Date(),
              releasedAt: null,
            },
          ],
          trackingHistory: [],
        });
        await tracking.save({ session });
      }

      // Verify seller has accepted the order
      const sellerAccepted =
        tracking.trackingHistory?.some(
          (item: any) =>
            item.holderType === "SELLER" &&
            item.status === "waiting_for_assignment",
        ) || false;

      if (!sellerAccepted) throw new Error("Order not accepted by seller yet");

      // Get seller location
      const sellerLocation = await SellerLocation.findOne({ userId: sellerId });
      if (!sellerLocation) throw new Error("Seller location not found");

      const sellerLat = sellerLocation.location?.coordinates?.[1];
      const sellerLng = sellerLocation.location?.coordinates?.[0];
      if (!sellerLat || !sellerLng)
        throw new Error("Seller coordinates not available");

      // Find nearest active FWS
      const allFWS = await FWSWareHouse.find({
        status: "ACTIVE",
        isAcceptingOrders: true,
      }).session(session);

      if (!allFWS.length) throw new Error("No active FWS available");

      let nearestFWS: any = null;
      let nearestDistance = Infinity;

      for (const warehouse of allFWS) {
        const distance = calculateDistance(
          sellerLat,
          sellerLng,
          warehouse.latitude,
          warehouse.longitude,
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestFWS = warehouse;
        }
      }

      if (!nearestFWS) throw new Error("No FWS available");

      const dispatchId = generateDispatchId();
      if (!order.shippingLabel) throw new Error("Shipping label not found");
      order.shippingLabel.qrData.dispatchId = dispatchId;

      // Set status to "in_transit_to_fws"
      tracking.currentStatus = "in_transit_to_fws";

      // Update currentFWS with destination details (not ownership)
      tracking.currentFWS = {
        userId: nearestFWS.userId.toString(),
        fwsCode: nearestFWS.fwsCode,
        fwsName: nearestFWS.name,
        city: nearestFWS.city,
        address: nearestFWS.address,
        latitude: nearestFWS.latitude,
        longitude: nearestFWS.longitude,
        processingStage: null,
        updatedAt: new Date(),
      };

      // Update currentLocation
      tracking.currentLocation = {
        address: nearestFWS.address,
        latitude: nearestFWS.latitude,
        longitude: nearestFWS.longitude,
        updatedAt: new Date(),
      };

      // Tracking history with SELLER as holder
      tracking.trackingHistory = addTrackingHistory(tracking.trackingHistory, {
        status: "in_transit_to_fws",
        holderType: "SELLER",
        holderId: sellerId,
        holderName: order.sellerName || "Seller",
        note: `Parcel dispatched to FWS warehouse: ${nearestFWS.name} (${nearestFWS.fwsCode}). Currently in transit.`,
        toLocation: {
          address: nearestFWS.address,
          latitude: nearestFWS.latitude,
          longitude: nearestFWS.longitude,
        },
      });

      // Ensure trackingId is saved
      if (!tracking.trackingId && trackingId) {
        tracking.trackingId = trackingId;
      }

      await tracking.save({ session });
      await order.save({ session });
      await session.commitTransaction();

      return {
        success: true,
        orderId,
        dispatchId,
        trackingId,
        fwsCode: nearestFWS.fwsCode,
        fwsName: nearestFWS.name,
        fwsUserId: nearestFWS.userId.toString(),
        distanceKm: Number(nearestDistance.toFixed(2)),
        status: "in_transit_to_fws",
        currentHolderType: "SELLER",
        currentHolderId: sellerId,
        message: `Parcel dispatched to ${nearestFWS.name} and currently in transit to warehouse. Awaiting physical receipt at FWS.`,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // ============================================
  // API 3: SELLER ASSIGNS SHIPPING PARTNER
  // ============================================

  static async sellerAssignShipping(
    orderId: string,
    sellerId: string,
    shippingId: string | undefined,
    assignmentType: "AUTO" | "MANUAL",
    shippingType: string,
  ) {
    await this.validateSeller(sellerId);
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await Order.findOne({ orderId, sellerId }).session(session);
      if (!order) throw new Error("Order not found or unauthorized");
      if (order.fulfillmentType !== "SELLER")
        throw new Error("Order not for seller fulfillment");

      const tracking = await DeliveryTracking.findOne({ orderId }).session(
        session,
      );
      const sellerAccepted =
        tracking?.trackingHistory?.some(
          (item: any) =>
            item.holderType === "SELLER" &&
            item.status === "waiting_for_assignment",
        ) || false;
      if (!sellerAccepted) throw new Error("Order not accepted by seller yet");

      if (tracking?.pendingAssignment?.status === "PENDING_ACCEPTANCE") {
        throw new Error("Another assignment is already pending for this order");
      }

      let assignedShippingId = shippingId,
        distance = 0;
      if (assignmentType === "AUTO") {
        const result = await this.findNearestAvailableShippingPartner(
          order.sellerAddress.latitude,
          order.sellerAddress.longitude,
          shippingType,
          [],
        );
        if (!result)
          throw new Error(
            `Auto-assignment failed: No ${shippingType} found within 100km`,
          );
        assignedShippingId = result.userId;
        distance = result.distance;
      } else {
        await this.validateShippingPartner(shippingId!, shippingType);
        assignedShippingId = shippingId;
      }

      const assignmentId = new mongoose.Types.ObjectId().toString();
      const pendingAssignment = {
        assignmentId,
        assigneeId: assignedShippingId!,
        assigneeType: shippingType,
        assignedBy: sellerId,
        assignedByType: "SELLER" as const,
        assignedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        assignmentType,
        distance: distance || 0,
        status: "PENDING_ACCEPTANCE" as const,
      };

      if (tracking) {
        tracking.pendingAssignment = pendingAssignment;
        tracking.currentAssignment = shippingType as any;
        tracking.currentStatus = "assignment_sent";
        tracking.trackingHistory = addTrackingHistory(
          tracking.trackingHistory,
          {
            status: "assignment_sent",
            holderType: "SELLER",
            holderId: sellerId,
            holderName: order.sellerName,
            note: `${shippingType} assignment sent (${assignmentType})`,
          },
        );
        await tracking.save({ session });
      }

      await session.commitTransaction();
      return {
        assignmentId,
        shippingId: assignedShippingId,
        shippingType,
        distance,
        status: "PENDING_ACCEPTANCE",
        message: `${shippingType} ${assignmentType.toLowerCase()} assigned successfully`,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // ============================================
  // API 4: VERIFY QR AND MARK READY FOR DISPATCH
  // ============================================

  static async verifyQR(qrData: any, fwsUserId: string): Promise<any> {
    console.log("\n🔍 ========================================");
    console.log("🔍 VERIFY QR AND MARK READY FOR DISPATCH - START");
    console.log("🔍 ========================================");

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      console.log("📥 Received qrData:", JSON.stringify(qrData, null, 2));
      console.log("📥 Received fwsUserId:", fwsUserId);

      // ============================================================
      // STEP 1: Extract orderId, sellerId, buyerId from QR data
      // ============================================================
      console.log("\n📋 STEP 1: Extracting QR Data");
      let orderId: string;
      let sellerId: string;
      let buyerId: string;
      let dispatchId: string | undefined;

      if (qrData.token) {
        console.log("🔑 JWT Token found in qrData");
        try {
          const token = qrData.token;
          console.log("📝 Token:", token.substring(0, 50) + "...");

          const parts = token.split(".");
          if (parts.length !== 3) {
            throw new Error("Invalid JWT token format");
          }

          const payload = Buffer.from(parts[1], "base64").toString("utf8");
          console.log("📝 Decoded Payload:", payload);

          const decoded = JSON.parse(payload);
          console.log("✅ Decoded JWT:", decoded);

          orderId = decoded.orderId;
          sellerId = decoded.sellerId;
          buyerId = decoded.buyerId;

          console.log("📦 Extracted from JWT:");
          console.log("  - orderId:", orderId);
          console.log("  - sellerId:", sellerId);
          console.log("  - buyerId:", buyerId);

          if (!orderId || !sellerId || !buyerId) {
            console.log("❌ Missing required fields in JWT");
            throw new Error("Invalid JWT token - missing required fields");
          }
        } catch (error: any) {
          console.error("❌ Failed to decode JWT:", error.message);
          throw new Error(`Invalid QR code token: ${error.message}`);
        }
      } else if (qrData.orderId && qrData.sellerId && qrData.buyerId) {
        console.log("📝 Direct fields found in qrData");
        orderId = qrData.orderId;
        sellerId = qrData.sellerId;
        buyerId = qrData.buyerId;
        dispatchId = qrData.dispatchId;
      } else if (qrData.fwsCode) {
        console.log("📝 fwsCode found in qrData:", qrData.fwsCode);
        const order = await Order.findOne({ fwsCode: qrData.fwsCode }).session(
          session,
        );
        if (!order) {
          throw new Error("Order not found for FWS code");
        }
        orderId = order.orderId;
        sellerId = order.sellerId;
        buyerId = order.buyerId;
      } else if (typeof qrData === "string") {
        console.log("📝 qrData is string:", qrData);
        const order = await Order.findOne({
          $or: [{ fwsCode: qrData }, { orderId: qrData }],
        }).session(session);

        if (!order) {
          throw new Error("Order not found for QR code");
        }
        orderId = order.orderId;
        sellerId = order.sellerId;
        buyerId = order.buyerId;
      } else {
        console.log("❌ No recognizable data in qrData");
        throw new Error("Invalid QR code format - no order data found");
      }

      console.log("✅ Final extracted data:");
      console.log("  - orderId:", orderId);
      console.log("  - sellerId:", sellerId);
      console.log("  - buyerId:", buyerId);
      console.log("  - dispatchId:", dispatchId);

      // ============================================================
      // STEP 2: Validate Seller and Buyer
      // ============================================================
      console.log("\n📋 STEP 2: Validating Seller and Buyer");

      const seller = await User.findById(sellerId).session(session);
      if (!seller) {
        console.log("❌ Seller not found:", sellerId);
        throw new Error(`Seller not found with ID: ${sellerId}`);
      }
      console.log("✅ Seller validated:", seller.email || seller.phone);

      const buyer = await User.findById(buyerId).session(session);
      if (!buyer) {
        console.log("❌ Buyer not found:", buyerId);
        throw new Error(`Buyer not found with ID: ${buyerId}`);
      }
      console.log("✅ Buyer validated:", buyer.email || buyer.phone);

      // ============================================================
      // STEP 3: Find Order
      // ============================================================
      console.log("\n📋 STEP 3: Finding Order");
      const query: any = { orderId, sellerId, buyerId };
      if (dispatchId) query["shippingLabel.qrData.dispatchId"] = dispatchId;

      console.log("📝 MongoDB Query:", JSON.stringify(query, null, 2));

      const order = await Order.findOne(query).session(session);
      if (!order) {
        console.log("❌ Order not found for query:", query);
        throw new Error("Invalid QR code or order not found");
      }

      console.log("✅ Order found:");
      console.log("  - Order ID:", order.orderId);
      console.log("  - Tracking ID:", order.trackingId);
      console.log("  - Fulfillment Type:", order.fulfillmentType);
      console.log("  - Status:", order.status);

      // ============================================================
      // STEP 4: Get Tracking Record
      // ============================================================
      console.log("\n📋 STEP 4: Getting Tracking Record");
      console.log("📝 Tracking ID from Order:", order.trackingId);

      const tracking = await DeliveryTracking.findOne({
        trackingId: order.trackingId,
      }).session(session);

      if (!tracking) {
        console.log(
          "❌ Tracking record not found for trackingId:",
          order.trackingId,
        );
        throw new Error("Tracking record not found");
      }

      console.log("✅ Tracking record found:");
      console.log("  - Tracking ID:", tracking.trackingId);
      console.log("  - Order ID:", tracking.orderId);
      console.log("  - Current Holder Type:", tracking.currentHolderType);
      console.log("  - Current FWS Code:", tracking.currentFWS?.fwsCode);
      console.log(
        "  - Processing Stage:",
        tracking.currentFWS?.processingStage,
      );

      // ============================================================
      // STEP 5: ✅ MUST BE AT FWS AND IN RECEIVED STAGE
      // ============================================================
      console.log("\n📋 STEP 5: Verifying Parcel at FWS");

      // Check if parcel is at FWS
      if (tracking.currentHolderType !== "FWS") {
        console.error(`❌ Parcel not at FWS: ${tracking.currentHolderType}`);
        throw new Error(
          `Parcel is not currently at FWS. Current holder: ${tracking.currentHolderType}. ` +
            `Parcel must be at FWS to verify.`,
        );
      }

      if (!tracking.currentFWS) {
        console.error("❌ Parcel has not been received at FWS");
        throw new Error("Parcel has not been received at FWS");
      }
      console.log(
        `✅ Parcel is at FWS: ${tracking.currentFWS.fwsName} (${tracking.currentFWS.fwsCode})`,
      );

      // ============================================================
      // STEP 6: Determine Scanner Type and Authorize
      // ============================================================
      console.log("\n📋 STEP 6: Authorizing Scanner");
      console.log("Scanner User ID:", fwsUserId);

      const fwsWarehouse = await FWSWareHouse.findOne({
        userId: fwsUserId,
        status: "ACTIVE",
      }).session(session);

      let scannerType: "OWNER" | "EMPLOYEE";
      let authorizedFWS = null;
      let scannedByName = "";
      let scannedByRole = "";

      if (fwsWarehouse) {
        scannerType = "OWNER";
        authorizedFWS = fwsWarehouse;
        scannedByName = fwsWarehouse.name || "FWS Owner";
        scannedByRole = "FWS_OWNER";

        console.log("✅ Scanner Type: OWNER");
        console.log("   FWS Code:", authorizedFWS.fwsCode);
        console.log("   Authorization Path: FWS Owner");
      } else {
        const employee = await Employee.findOne({
          userId: fwsUserId,
          approvalStatus: "APPROVED",
          isActive: true,
        }).session(session);

        if (!employee) {
          console.log(
            "❌ Authorization Failed: User is neither Owner nor Approved Employee",
          );
          throw new Error(
            "User not authorized to scan parcels. " +
              "Must be an active FWS Owner or an approved Employee.",
          );
        }

        const fwsWithEmployee = await FWSWareHouse.findOne({
          fwsCode: employee.fwsCode,
          status: "ACTIVE",
        }).session(session);

        if (!fwsWithEmployee) {
          console.log(
            `❌ Authorization Failed: Employee's FWS (${employee.fwsCode}) is not ACTIVE`,
          );
          throw new Error(
            `Employee's assigned FWS (${employee.fwsCode}) is not active or not found.`,
          );
        }

        const user = await User.findById(fwsUserId)
          .select("name")
          .session(session);
        if (!user) {
          throw new Error("Employee user record not found");
        }

        scannerType = "EMPLOYEE";
        authorizedFWS = fwsWithEmployee;
        scannedByName = user.name || "Employee";
        scannedByRole = employee.role || "EMPLOYEE";

        console.log("✅ Scanner Type: EMPLOYEE");
        console.log("   FWS Code:", authorizedFWS.fwsCode);
        console.log("   Employee Role:", employee.role);
        console.log("   Authorization Path: Employee (APPROVED & ACTIVE)");
      }

      // ============================================================
      // STEP 7: ✅ CHECK IF ALREADY VERIFIED - RETURN DUPLICATE ERROR
      // ============================================================
      console.log("\n📋 STEP 7: ⚠️ DUPLICATE VERIFICATION DETECTION");

      // Check if already SCANNED
      if (tracking.currentFWS?.processingStage === FWSProcessingStage.SCANNED) {
        console.error("❌ Parcel already verified (processingStage = SCANNED)");

        await session.abortTransaction();
        session.endSession();

        const error = new Error("Duplicate Scan Not Allowed");
        (error as any).statusCode = 409;
        (error as any).response = {
          success: false,
          duplicate: true,
          code: "DUPLICATE_SCAN",
          message: "Duplicate Scan Not Allowed",
          details:
            "This parcel has already been verified and is ready for dispatch.",
        };
        throw error;
      }

      // Check trackingHistory for duplicate
      const existingVerificationHistory = tracking.trackingHistory.some(
        (entry: any) =>
          entry.status === "scanned_at_fws" &&
          entry.holderId === authorizedFWS.userId.toString() &&
          entry.scanInfo?.scannedByUserId === fwsUserId,
      );

      if (existingVerificationHistory) {
        console.error("❌ DUPLICATE VERIFICATION DETECTED in trackingHistory!");

        await session.abortTransaction();
        session.endSession();

        const error = new Error("Duplicate Scan Not Allowed");
        (error as any).statusCode = 409;
        (error as any).response = {
          success: false,
          duplicate: true,
          code: "DUPLICATE_SCAN",
          message: "Duplicate Scan Not Allowed",
          details: "This QR has already been verified by this user.",
        };
        throw error;
      }

      // Check routeHistory for duplicate verification
      const existingVerification = tracking.routeHistory.some(
        (r: any) =>
          r.scanType === "VERIFICATION" &&
          r.toHolderId === authorizedFWS.userId.toString() &&
          r.scannedByUserId === fwsUserId,
      );

      if (existingVerification) {
        console.error("❌ DUPLICATE VERIFICATION DETECTED in routeHistory!");

        await session.abortTransaction();
        session.endSession();

        const error = new Error("Duplicate Scan Not Allowed");
        (error as any).statusCode = 409;
        (error as any).response = {
          success: false,
          duplicate: true,
          code: "DUPLICATE_SCAN",
          message: "Duplicate Scan Not Allowed",
          details: "This QR has already been verified at this FWS.",
        };
        throw error;
      }

      // ✅ Must be in RECEIVED stage
      if (
        tracking.currentFWS?.processingStage !== FWSProcessingStage.RECEIVED
      ) {
        console.error(
          `❌ Parcel not in RECEIVED stage: ${tracking.currentFWS?.processingStage}`,
        );
        throw new Error(
          `Parcel not in RECEIVED stage. Current stage: ${tracking.currentFWS?.processingStage || "None"}. ` +
            `Must be physically received before verification.`,
        );
      }
      console.log("✅ Order is in RECEIVED stage - ready for verification");

      // ============================================================
      // STEP 8: Generate Verification Fingerprint
      // ============================================================
      const verificationFingerprint = this.generateScanFingerprint(
        orderId,
        tracking.currentHolderId || "unknown",
        authorizedFWS.userId.toString(),
        "VERIFICATION",
        fwsUserId,
      );

      console.log(`🔍 Verification Fingerprint: ${verificationFingerprint}`);

      // ============================================================
      // STEP 9: Update Tracking Record - MARK AS SCANNED
      // ============================================================
      console.log("\n📋 STEP 9: Updating Tracking Record (MARKING AS SCANNED)");

      const scanId = `VERIFICATION_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // Add to routeHistory
      tracking.routeHistory.push({
        scanId: scanId,
        scanFingerprint: verificationFingerprint,
        fromHolderId: tracking.currentHolderId,
        fromHolderType: tracking.currentHolderType,
        fromHolderName: tracking.currentHolderName,
        toHolderId: tracking.currentHolderId,
        toHolderType: tracking.currentHolderType,
        toHolderName: tracking.currentHolderName,
        scannedByUserId: fwsUserId,
        scannedByName: scannedByName,
        location: {
          latitude: authorizedFWS.latitude,
          longitude: authorizedFWS.longitude,
          address: authorizedFWS.address,
        },
        transferredAt: new Date(),
        scanType: "VERIFICATION",
        scannedByType: scannerType,
      });

      console.log(`✅ Route History Added`);
      console.log(`   Scan ID: ${scanId}`);
      console.log(`   Fingerprint: ${verificationFingerprint}`);

      // Update processingStage to SCANNED
      tracking.currentFWS = {
        userId: authorizedFWS.userId.toString(),
        fwsCode: authorizedFWS.fwsCode,
        fwsName: authorizedFWS.name,
        city: authorizedFWS.city,
        address: authorizedFWS.address,
        latitude: authorizedFWS.latitude,
        longitude: authorizedFWS.longitude,
        processingStage: FWSProcessingStage.SCANNED,
        updatedAt: new Date(),
        scannedByType: scannerType,
        scannedByUserId: fwsUserId,
        scannedAt: new Date(),
      };

      console.log(`✅ FWS Processing Stage Updated: RECEIVED -> SCANNED`);

      // Update status to scanned_at_fws
      tracking.currentStatus = "scanned_at_fws";
      console.log(`✅ Tracking Status Updated: scanned_at_fws`);

      // Add tracking history
      tracking.trackingHistory = addTrackingHistory(tracking.trackingHistory, {
        status: "scanned_at_fws",
        holderType: "FWS",
        holderId: authorizedFWS.userId.toString(),
        holderName: authorizedFWS.name,
        note: `QR verified at FWS by ${scannerType.toLowerCase()}: ${scannedByName} (${fwsUserId}). Parcel inspection complete.`,
        toLocation: {
          address: authorizedFWS.address,
          latitude: authorizedFWS.latitude,
          longitude: authorizedFWS.longitude,
        },
        scanInfo: {
          scannedByUserId: fwsUserId,
          scannedByName: scannedByName,
          scannedByType: scannerType === "OWNER" ? "FWS_OWNER" : "FWS_EMPLOYEE",
          scannedAt: new Date(),
          scanType: "VERIFICATION",
        },
        fwsProcessingStage: FWSProcessingStage.SCANNED,
      });

      console.log(`✅ Tracking History Added`);

      await tracking.save({ session });
      console.log("✅ Tracking record saved");

      // ============================================================
      // STEP 10: Create Activity Record
      // ============================================================
      console.log("\n📋 STEP 10: Creating Activity Record");

      const activity = new FWSEmployeeActivity({
        employeeUserId: fwsUserId,
        employeeName: scannedByName,
        fwsUserId: authorizedFWS.userId.toString(),
        fwsCode: authorizedFWS.fwsCode,
        activityType: FWSEmployeeActivityType.VERIFIED_AT_FWS,
        orderId: order.orderId,
        trackingId: tracking.trackingId,
        activityDate: new Date(),
        scannerType: scannerType,
        metadata: {
          processingStage: FWSProcessingStage.SCANNED,
          isOwner: scannerType === "OWNER",
          isEmployee: scannerType === "EMPLOYEE",
          orderId: order.orderId,
          sellerId: sellerId,
          buyerId: buyerId,
        },
      });

      await activity.save({ session });
      console.log(`✅ Activity Record Created: ${activity._id}`);

      await session.commitTransaction();
      console.log("✅ Transaction Committed Successfully");

      // ============================================================
      // STEP 11: Return Response
      // ============================================================
      console.log("\n📋 STEP 11: Returning Response");
      console.log("   Success: true");
      console.log(`   Status: ${tracking.currentStatus}`);
      console.log(`   Processing Stage: ${FWSProcessingStage.SCANNED}`);
      console.log("\n🔍 ========================================");
      console.log("🔍 VERIFY QR AND MARK READY FOR DISPATCH - COMPLETE ✅");
      console.log("🔍 ========================================\n");

      return {
        success: true,
        order: {
          orderId: order.orderId,
          sellerId: order.sellerId,
          buyerId: order.buyerId,
          trackingId: order.trackingId,
        },
        fwsDetails: {
          fwsCode: authorizedFWS.fwsCode,
          name: authorizedFWS.name,
          city: authorizedFWS.city,
          address: authorizedFWS.address,
          processingStage: FWSProcessingStage.SCANNED,
        },
        scanDetails: {
          scannedBy: {
            userId: fwsUserId,
            name: scannedByName,
            isOwner: scannerType === "OWNER",
            isEmployee: scannerType === "EMPLOYEE",
            role: scannedByRole,
          },
          scannedAt: new Date(),
          processingStage: FWSProcessingStage.SCANNED,
          activityId: activity._id,
        },
        currentHolder: {
          type: tracking.currentHolderType,
          id: tracking.currentHolderId,
          name: tracking.currentHolderName,
        },
        message: `QR verified at ${authorizedFWS.name} by ${scannerType.toLowerCase()}. Parcel is now in SCANNED stage. Ready for dispatch assignment.`,
        readyForDispatch: true,
      };
    } catch (error: any) {
      console.error("\n❌ ========================================");
      console.error("❌ VERIFY QR AND MARK READY FOR DISPATCH - ERROR");
      console.error("❌ ========================================");
      console.error(error);
      console.error("❌ ========================================\n");

      if (error.response && error.response.duplicate === true) {
        throw error;
      }

      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
      console.log("🔚 Session ended");
    }
  }
  // ============================================
  // API 5: FWS ASSIGNS SHIPPING PARTNER
  // ============================================

  // ============================================
  // API 5: FWS ASSIGNS SHIPPING PARTNER - COMPLETE FIXED
  // ============================================

  static async fwsAssignShipping(
    orderId: string,
    fwsUserId: string,
    shippingId: string | undefined,
    assignmentType: "AUTO" | "MANUAL",
    shippingType: string,
  ): Promise<any> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      console.log("\n🚚 ========================================");
      console.log("🚚 FWS ASSIGN SHIPPING - START");
      console.log("🚚 ========================================");
      console.log(`📌 Order ID: ${orderId}`);
      console.log(`📌 FWS User ID: ${fwsUserId}`);
      console.log(`📌 Shipping Type: ${shippingType}`);
      console.log(`📌 Assignment Type: ${assignmentType}`);

      // ============================================================
      // STEP 1: Validate Employee
      // ============================================================
      console.log("\n📋 STEP 1: Validating Employee");
      const employee = await Employee.findOne({
        userId: fwsUserId,
        approvalStatus: "APPROVED",
        isActive: true,
      }).session(session);

      if (!employee) {
        console.error("❌ Employee not authorized");
        throw new Error("Employee not authorized");
      }
      console.log(`✅ Employee Validated: ${employee.name}`);

      // ============================================================
      // STEP 2: Validate FWS Warehouse
      // ============================================================
      console.log("\n📋 STEP 2: Validating FWS Warehouse");
      const fws = await FWSWareHouse.findOne({
        fwsCode: employee.fwsCode,
        status: "ACTIVE",
      }).session(session);

      if (!fws) {
        console.error("❌ Employee not authorized or FWS not found");
        throw new Error("Employee not authorized or FWS not found");
      }
      console.log(`✅ FWS Validated: ${fws.name} (${fws.fwsCode})`);

      // ============================================================
      // STEP 3: Get Performer Details
      // ============================================================
      console.log("\n📋 STEP 3: Getting Performer Details");
      const performer = await User.findById(fwsUserId).select("name");
      if (!performer) {
        console.error("❌ Performer not found");
        throw new Error("Performer not found");
      }
      console.log(`✅ Performer: ${performer.name}`);

      // ============================================================
      // STEP 4: Find Order
      // ============================================================
      console.log("\n📋 STEP 4: Finding Order");
      const order = await Order.findOne({ orderId }).session(session);
      if (!order) {
        console.error(`❌ Order not found: ${orderId}`);
        throw new Error("Order not found");
      }
      console.log(`✅ Order Found: ${order.orderId}`);

      // ============================================================
      // STEP 5: Find Tracking
      // ============================================================
      console.log("\n📋 STEP 5: Finding Tracking");
      const tracking = await DeliveryTracking.findOne({ orderId }).session(
        session,
      );
      if (!tracking) {
        console.error(`❌ Tracking not found for order: ${orderId}`);
        throw new Error("Tracking record not found");
      }
      console.log(`✅ Tracking Found:`);
      console.log(`   Tracking ID: ${tracking.trackingId}`);
      console.log(`   Current Holder: ${tracking.currentHolderType}`);
      console.log(
        `   Processing Stage: ${tracking.currentFWS?.processingStage}`,
      );

      // ============================================================
      // STEP 6: Validate FWS Ownership
      // ============================================================
      console.log("\n📋 STEP 6: Validating FWS Ownership");
      if (tracking.currentHolderType !== "FWS") {
        console.error(
          `❌ Order not held by FWS: ${tracking.currentHolderType}`,
        );
        throw new Error(
          `Order not held by FWS. Current holder: ${tracking.currentHolderType}`,
        );
      }

      if (tracking.currentFWS?.userId !== fws.userId.toString()) {
        console.error(`❌ Order not at this FWS`);
        console.log(`   Current FWS: ${tracking.currentFWS?.userId}`);
        console.log(`   Scanning FWS: ${fws.userId}`);
        throw new Error("Unauthorized: Order not at this FWS");
      }
      console.log(`✅ FWS Ownership Verified`);

      // ============================================================
      // STEP 7: Validate Processing Stage
      // ============================================================
      console.log("\n📋 STEP 7: Validating Processing Stage");
      if (tracking.currentFWS?.processingStage !== FWSProcessingStage.SCANNED) {
        console.error(
          `❌ Parcel not scanned: ${tracking.currentFWS?.processingStage}`,
        );
        throw new Error(
          `Parcel not scanned yet. Current processing stage: ${tracking.currentFWS?.processingStage || "None"}. ` +
            `Must scan QR first using verifyQRAndMarkReadyForDispatch().`,
        );
      }
      console.log(`✅ Processing Stage: SCANNED`);

      // ============================================================
      // STEP 8: Check for Existing Pending Assignment
      // ============================================================
      console.log("\n📋 STEP 8: Checking Existing Pending Assignment");

      if (tracking.pendingAssignment?.status === "PENDING_ACCEPTANCE") {
        console.error(
          "❌ Another assignment is already pending for this order",
        );
        console.log(
          `   Existing Assignment ID: ${tracking.pendingAssignment.assignmentId}`,
        );
        console.log(`   Assignee: ${tracking.pendingAssignment.assigneeType}`);
        await session.abortTransaction();
        return {
          success: false,
          message: "Another assignment is already pending for this order",
          pendingAssignment: tracking.pendingAssignment,
        };
      }

      // ============================================================
      // ✅ STEP 9: BUILD EXCLUDE LIST - Jo already handle kar chuke hain
      // ============================================================
      console.log(
        "\n📋 STEP 9: Building Exclude List (Already handled this order)",
      );

      const excludedUserIds: string[] = [];
      const excludedDetails: string[] = [];

      // 1. Check RouteHistory - jinhone already handover kiya
      if (tracking.routeHistory && tracking.routeHistory.length > 0) {
        tracking.routeHistory.forEach((r: any) => {
          // From Holder (who gave the parcel)
          if (r.fromHolderType === "RIDER" || r.fromHolderType === "TRUCK") {
            if (!excludedUserIds.includes(r.fromHolderId)) {
              excludedUserIds.push(r.fromHolderId);
              excludedDetails.push(
                `RouteHistory-From: ${r.fromHolderType} (${r.fromHolderName || r.fromHolderId})`,
              );
            }
          }
          // To Holder (who received the parcel)
          if (r.toHolderType === "RIDER" || r.toHolderType === "TRUCK") {
            if (!excludedUserIds.includes(r.toHolderId)) {
              excludedUserIds.push(r.toHolderId);
              excludedDetails.push(
                `RouteHistory-To: ${r.toHolderType} (${r.toHolderName || r.toHolderId})`,
              );
            }
          }
        });
      }

      // 2. Check AssignmentHistory - jo pehle assign ho chuke hain
      if (tracking.assignmentHistory && tracking.assignmentHistory.length > 0) {
        tracking.assignmentHistory.forEach((a: any) => {
          if (a.assigneeType === "RIDER" || a.assigneeType === "TRUCK") {
            if (!excludedUserIds.includes(a.assigneeId)) {
              excludedUserIds.push(a.assigneeId);
              excludedDetails.push(
                `AssignmentHistory: ${a.assigneeType} (Status: ${a.status})`,
              );
            }
          }
        });
      }

      // 3. Check PendingAssignment - jo abhi assign hai
      if (tracking.pendingAssignment) {
        if (
          tracking.pendingAssignment.assigneeType === "RIDER" ||
          tracking.pendingAssignment.assigneeType === "TRUCK"
        ) {
          if (
            !excludedUserIds.includes(tracking.pendingAssignment.assigneeId)
          ) {
            excludedUserIds.push(tracking.pendingAssignment.assigneeId);
            excludedDetails.push(
              `PendingAssignment: ${tracking.pendingAssignment.assigneeType} (Status: ${tracking.pendingAssignment.status})`,
            );
          }
        }
      }

      // 4. Check Current Holder - agar abhi RIDER ya TRUCK hai
      if (
        tracking.currentHolderType === "RIDER" ||
        tracking.currentHolderType === "TRUCK"
      ) {
        if (!excludedUserIds.includes(tracking.currentHolderId)) {
          excludedUserIds.push(tracking.currentHolderId);
          excludedDetails.push(`CurrentHolder: ${tracking.currentHolderType}`);
        }
      }

      console.log(`✅ Excluded Users: ${excludedUserIds.length}`);
      excludedDetails.forEach((detail, index) => {
        console.log(`   ${index + 1}. ${detail}`);
      });
      console.log(`   Excluded IDs: ${excludedUserIds.join(", ")}`);

      // ============================================================
      // STEP 10: Check if Exclude List is Empty - Warning
      // ============================================================
      if (excludedUserIds.length === 0) {
        console.warn(
          "⚠️ No excluded users found! This might be the first assignment.",
        );
      }

      // ============================================================
      // STEP 11: Assign Shipping Partner
      // ============================================================
      console.log("\n📋 STEP 11: Assigning Shipping Partner");
      let assignedShippingId = shippingId;
      let distance = 0;

      if (assignmentType === "AUTO") {
        console.log(
          `🔍 Finding nearest ${shippingType} (excluding ${excludedUserIds.length} already handled)...`,
        );

        // ✅ PASS EXCLUDE LIST TO AUTO-ASSIGNMENT
        const result = await this.findNearestAvailableShippingPartner(
          fws.latitude,
          fws.longitude,
          shippingType,
          excludedUserIds, // 🔥 YAHI MAGIC HAI - Exclude list pass karo!
        );

        if (!result) {
          console.error(
            `❌ Auto-assignment failed: No ${shippingType} found within 100km`,
          );
          throw new Error(
            `Auto-assignment failed: No ${shippingType} found within 100km`,
          );
        }
        assignedShippingId = result.userId;
        distance = result.distance;
        console.log(
          `✅ Nearest ${shippingType} found: ${result.userId} (${distance.toFixed(2)} km)`,
        );

        // ✅ DOUBLE CHECK: Ensure we didn't assign an excluded partner
        if (excludedUserIds.includes(assignedShippingId)) {
          console.error(
            `❌ CRITICAL: Assigned a partner that was supposed to be excluded!`,
          );
          console.log(`   Assigned ID: ${assignedShippingId}`);
          console.log(`   Excluded IDs: ${excludedUserIds.join(", ")}`);
          throw new Error(
            `System error: Assigned a shipping partner that already handled this order.`,
          );
        }
      } else {
        console.log(`🔍 Validating manual ${shippingType}...`);

        // ✅ MANUAL: Check if selected partner is excluded
        if (shippingId && excludedUserIds.includes(shippingId)) {
          console.error(
            `❌ Selected ${shippingType} already handled this order!`,
          );
          console.log(`   Selected ID: ${shippingId}`);
          console.log(`   Excluded IDs: ${excludedUserIds.join(", ")}`);
          await session.abortTransaction();
          return {
            success: false,
            message: `Selected ${shippingType} has already handled this order. Please select a different ${shippingType}.`,
            alreadyHandled: true,
            assigneeId: shippingId,
            excludedPartners: excludedUserIds,
          };
        }

        await this.validateShippingPartner(shippingId!, shippingType);
        assignedShippingId = shippingId;
        console.log(
          `✅ Manual ${shippingType} validated: ${assignedShippingId}`,
        );
      }

      // ============================================================
      // STEP 12: Get Shipping Partner Details
      // ============================================================
      console.log("\n📋 STEP 12: Getting Shipping Partner Details");
      const shippingPartner =
        await User.findById(assignedShippingId).select("name");
      if (!shippingPartner) {
        console.error(`❌ Shipping partner not found: ${assignedShippingId}`);
        throw new Error("Shipping partner not found");
      }
      console.log(`✅ Shipping Partner: ${shippingPartner.name}`);

      // ============================================================
      // STEP 13: Create Assignment ID and History Entry
      // ============================================================
      console.log("\n📋 STEP 13: Creating Assignment");
      const assignmentId = new mongoose.Types.ObjectId().toString();
      console.log(`✅ Assignment ID: ${assignmentId}`);

      const assignmentHistoryEntry = {
        assignmentId,
        assigneeId: assignedShippingId!,
        assigneeType: shippingType as "RIDER" | "TRUCK",
        assignedBy: fws.userId.toString(),
        assignedByType: "FWS" as const,
        assignedAt: new Date(),
        assignmentType,
        distance: distance || 0,
        status: "PENDING_ACCEPTANCE" as const,
      };

      if (!tracking.assignmentHistory) {
        tracking.assignmentHistory = [];
      }

      tracking.assignmentHistory.push(assignmentHistoryEntry);
      console.log(`✅ Assignment History Entry Created`);

      // ============================================================
      // STEP 14: Set Current Pending Assignment
      // ============================================================
      const pendingAssignment = {
        assignmentId,
        assigneeId: assignedShippingId!,
        assigneeType: shippingType as "RIDER" | "TRUCK",
        assignedBy: fws.userId.toString(),
        assignedByType: "FWS" as const,
        assignedAt: new Date(),
        assignmentType,
        distance: distance || 0,
        status: "PENDING_ACCEPTANCE" as const,
      };

      tracking.pendingAssignment = pendingAssignment;
      tracking.currentStatus = "ready_for_dispatch";
      console.log(`✅ Pending Assignment Set`);

      // ============================================================
      // STEP 15: Update FWS Processing Stage
      // ============================================================
      tracking.currentFWS = {
        userId: fws.userId.toString(),
        fwsCode: fws.fwsCode,
        fwsName: fws.name,
        city: fws.city,
        address: fws.address,
        latitude: fws.latitude,
        longitude: fws.longitude,
        processingStage: FWSProcessingStage.READY_FOR_DISPATCH,
        updatedAt: new Date(),
      };
      console.log(`✅ FWS Processing Stage Updated: READY_FOR_DISPATCH`);

      // ============================================================
      // STEP 16: Add Tracking History
      // ============================================================
      tracking.trackingHistory = addTrackingHistory(tracking.trackingHistory, {
        status: "ready_for_dispatch",
        holderType: "FWS",
        holderId: fws.userId.toString(),
        holderName: fws.name,
        note: `${shippingType} assigned for dispatch (${assignmentType})`,
        fwsProcessingStage: FWSProcessingStage.READY_FOR_DISPATCH,
      });
      console.log(`✅ Tracking History Added`);

      // ============================================================
      // STEP 17: Save Tracking
      // ============================================================
      console.log("\n📋 STEP 17: Saving Tracking");
      await tracking.save({ session });
      console.log(`✅ Tracking Saved`);

      // ============================================================
      // STEP 18: Create Activity Records
      // ============================================================
      console.log("\n📋 STEP 18: Creating Activity Records");

      const readyActivity = new FWSEmployeeActivity({
        employeeUserId: fwsUserId,
        employeeName: performer.name,
        fwsUserId: fws.userId.toString(),
        fwsCode: fws.fwsCode,
        activityType: FWSEmployeeActivityType.READY_FOR_DISPATCH,
        orderId: order.orderId,
        trackingId: tracking.trackingId,
        activityDate: new Date(),
      });

      await readyActivity.save({ session });
      console.log(`✅ Ready Activity Created: ${readyActivity._id}`);

      const assignActivity = new FWSEmployeeActivity({
        employeeUserId: fwsUserId,
        employeeName: performer.name,
        fwsUserId: fws.userId.toString(),
        fwsCode: fws.fwsCode,
        activityType: FWSEmployeeActivityType.ASSIGNED_SHIPPING,
        orderId: order.orderId,
        trackingId: tracking.trackingId,
        activityDate: new Date(),
      });

      await assignActivity.save({ session });
      console.log(`✅ Assign Activity Created: ${assignActivity._id}`);

      // ============================================================
      // STEP 19: Commit Transaction
      // ============================================================
      await session.commitTransaction();
      console.log("✅ Transaction Committed Successfully");
      console.log("🚚 ========================================");
      console.log("🚚 FWS ASSIGN SHIPPING - COMPLETE ✅");
      console.log("🚚 ========================================\n");

      // ============================================================
      // STEP 20: Return Response
      // ============================================================
      return {
        success: true,
        assignmentId,
        shippingId: assignedShippingId,
        shippingName: shippingPartner.name,
        shippingType,
        distance,
        status: "PENDING_ACCEPTANCE",
        processingStage: FWSProcessingStage.READY_FOR_DISPATCH,
        readyActivityId: readyActivity._id,
        assignActivityId: assignActivity._id,
        excludedPartners: excludedUserIds, // ✅ Return exclude list for debugging
        excludedCount: excludedUserIds.length,
        message: `${shippingType} ${assignmentType.toLowerCase()} assigned successfully to ${shippingPartner.name}`,
      };
    } catch (error) {
      console.error("\n❌ ========================================");
      console.error("❌ FWS ASSIGN SHIPPING - ERROR");
      console.error("❌ ========================================");
      console.error(error);
      console.error("❌ ========================================\n");
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  // ============================================
  // API 6: SHIPPING PARTNER ACCEPTS ASSIGNMENT
  // ============================================

  static async acceptAssignment(
    orderId: string,
    assignmentId: string,
    userId: string,
  ) {
    console.log("========== BACKEND ACCEPT ASSIGNMENT DEBUG ==========");
    console.log("📌 Input Parameters:");
    console.log("   orderId:", orderId);
    console.log("   assignmentId:", assignmentId);
    console.log("   userId:", userId);
    console.log("==================================================");

    const { shipping, shippingLocation } =
      await this.validateShippingPartner(userId);
    const shippingType = shipping.shippingType;

    console.log("📌 Shipping Partner Info:");
    console.log("   shippingType:", shippingType);
    console.log("   shippingName:", shipping.name);
    console.log("   shippingLocation:", shippingLocation.location?.address);
    console.log("==================================================");

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      console.log("🔍 Step 1: Finding Order...");
      const order = await Order.findOne({ orderId }).session(session);

      if (!order) {
        console.log("❌ Order not found for orderId:", orderId);
        throw new Error("Order not found");
      }
      console.log("✅ Order found!");
      console.log("   Order ID:", order._id);
      console.log("   Order Status:", order.status);
      console.log("   Existing TrackingId:", order.trackingId);
      console.log("==================================================");

      console.log("🔍 Step 2: Handling Tracking ID...");
      let trackingId = order.trackingId;
      if (!trackingId) {
        trackingId = generateTrackingId();
        order.trackingId = trackingId;
        await order.save({ session });
        console.log("✅ New Tracking ID generated:", trackingId);
      } else {
        console.log("✅ Existing Tracking ID:", trackingId);
      }
      console.log("==================================================");

      console.log("🔍 Step 3: Finding and Updating DeliveryTracking...");

      // ✅ FIRST: Check if assignment already accepted
      const trackingForCheck = await DeliveryTracking.findOne({
        orderId,
        "pendingAssignment.assignmentId": assignmentId,
      }).session(session);

      if (trackingForCheck) {
        // Check if already accepted using helper
        const { alreadyAccepted, message } =
          this.checkAssignmentAlreadyAccepted(
            trackingForCheck.pendingAssignment,
            trackingForCheck.assignmentHistory || [],
            assignmentId,
          );

        if (alreadyAccepted) {
          console.log(`❌ ${message}`);
          await session.abortTransaction();
          return {
            success: false,
            alreadyAccepted: true,
            message: message || "Assignment already accepted",
          };
        }
      }

      // ✅ Proceed with acceptance
      const updatedTracking = await DeliveryTracking.findOneAndUpdate(
        {
          orderId,
          "pendingAssignment.assignmentId": assignmentId,
          "pendingAssignment.status": "PENDING_ACCEPTANCE",
          currentStatus: { $nin: ["assignment_accepted", "delivered"] },
        },
        {
          $set: {
            currentStatus: "assignment_accepted",
            currentShipping: {
              shippingUserId: new mongoose.Types.ObjectId(userId),
              shippingName: shipping.name,
              latitude: shippingLocation.location?.latitude,
              longitude: shippingLocation.location?.longitude,
              shippingType: shippingType,
              updatedAt: new Date(),
            },
            trackingId: trackingId,
          },
          $push: {
            trackingHistory: {
              status: "assignment_accepted",
              holderType: "SELLER",
              holderId: order.sellerId,
              holderName: "Seller",
              note: `${shippingType} accepted assignment. Waiting for QR handover.`,
              fromLocation: {
                address: shippingLocation.location?.address,
                latitude: shippingLocation.location?.latitude,
                longitude: shippingLocation.location?.longitude,
              },
              createdAt: new Date(),
            },
          },
        },
        { session, new: true, runValidators: true },
      );

      if (!updatedTracking) {
        console.log("❌ Update failed! No document matched the criteria.");
        throw new Error(
          "Assignment already accepted, expired, or order already assigned/delivered",
        );
      }

      // ✅ Preserve assignment history - update status, don't delete
      if (updatedTracking.pendingAssignment) {
        const historyIndex = (
          updatedTracking.assignmentHistory || []
        ).findIndex((a: any) => a.assignmentId === assignmentId);

        if (historyIndex !== -1) {
          updatedTracking.assignmentHistory[historyIndex].status = "ACCEPTED";
          updatedTracking.assignmentHistory[historyIndex].acceptedAt =
            new Date();
        } else {
          const historyEntry = {
            assignmentId: updatedTracking.pendingAssignment.assignmentId,
            assigneeId: updatedTracking.pendingAssignment.assigneeId,
            assigneeType: updatedTracking.pendingAssignment.assigneeType,
            assignedBy: updatedTracking.pendingAssignment.assignedBy,
            assignedByType: updatedTracking.pendingAssignment.assignedByType,
            assignedAt: updatedTracking.pendingAssignment.assignedAt,
            assignmentType: updatedTracking.pendingAssignment.assignmentType,
            distance: updatedTracking.pendingAssignment.distance || 0,
            status: "ACCEPTED" as const,
            acceptedAt: new Date(),
          };
          if (!updatedTracking.assignmentHistory) {
            updatedTracking.assignmentHistory = [];
          }
          updatedTracking.assignmentHistory.push(historyEntry);
        }

        // Update status, DO NOT DELETE
        updatedTracking.pendingAssignment.status = "ACCEPTED";

        await updatedTracking.save({ session });
      }

      console.log("✅ DeliveryTracking updated successfully!");
      console.log("   New currentStatus:", updatedTracking.currentStatus);
      console.log(
        "   currentHolderType (UNCHANGED):",
        updatedTracking.currentHolderType,
      );
      console.log(
        "   pendingAssignment status:",
        updatedTracking.pendingAssignment?.status,
      );
      console.log(
        "   assignmentHistory length:",
        (updatedTracking.assignmentHistory || []).length,
      );
      console.log("==================================================");

      console.log("🔍 Step 4: Updating Shipping Partner Stats...");
      shipping.orderStats.assigned += 1;
      shipping.orderStats.remaining += 1;
      await shipping.save({ session });
      console.log("✅ Shipping partner stats updated!");
      console.log("==================================================");

      await session.commitTransaction();
      console.log("✅ Transaction committed successfully!");
      console.log("========== ACCEPT ASSIGNMENT SUCCESS ==========");

      return {
        trackingId,
        orderId,
        tracking: updatedTracking,
        message: "Assignment accepted. Waiting for QR handover.",
      };
    } catch (error: any) {
      console.log("❌ ERROR OCCURRED!");
      console.log("   Error Message:", error?.message);
      console.log("========== ACCEPT ASSIGNMENT FAILED ==========");
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
      console.log("🔒 Database session ended");
    }
  }

  // ============================================
  // API: GET ORDER QR CODE
  // ============================================

  static async getOrderQRCode(orderId: string, userId: string) {
    const visibility = await this.getQRVisibility(orderId, userId);
    if (!visibility.showQR)
      return { showQR: false, message: visibility.reason };

    const order = await Order.findOne({ orderId });
    if (!order?.shippingLabel?.qrCodeUrl) throw new Error("QR code not found");

    const tracking = await DeliveryTracking.findOne({ orderId });
    return {
      showQR: true,
      qrCodeUrl: order.shippingLabel.qrCodeUrl,
      qrData: order.shippingLabel.qrData,
      holderType: tracking?.currentHolderType,
      holderId: tracking?.currentHolderId,
      status: tracking?.currentStatus,
    };
  }
  // ============================================
  // QUERY METHODS
  // ============================================

  static async getTrackingByOrderId(orderId: string, userId: string) {
    const order = await Order.findOne({ orderId });
    if (!order) throw new Error("Order not found");
    const tracking = await DeliveryTracking.findOne({ orderId });
    if (!tracking) throw new Error("Tracking not found");

    const isSeller = order.sellerId === userId;
    const isBuyer = order.buyerId === userId;
    let isFWS = false;
    if (tracking.currentFWS?.fwsCode) {
      const fws = await FWSWareHouse.findOne({
        fwsCode: tracking.currentFWS.fwsCode,
        "employees.userId": userId,
      });
      isFWS = !!fws;
    }
    const isAssigned =
      tracking.currentHolderId === userId ||
      tracking.currentShipping?.shippingUserId?.toString() === userId;
    if (!isSeller && !isBuyer && !isFWS && !isAssigned)
      throw new Error("Unauthorized to view this tracking");
    return tracking;
  }

  static async getOrdersBySeller(sellerId: string) {
    await this.validateSeller(sellerId);
    const orders = await Order.find({ sellerId }).sort({ createdAt: -1 });
    const ordersWithTracking = await Promise.all(
      orders.map(async (order) => ({
        order,
        tracking: await DeliveryTracking.findOne({ orderId: order.orderId }),
      })),
    );
    return ordersWithTracking;
  }

  // ============================================================
  // TRACKING SERVICE - getOrdersByFWS
  // ============================================================

  static async getOrdersByFWS(fwsUserId: string): Promise<FWSOrdersResponse> {
    console.log("════════════════════════════════════════════");
    console.log("🔍 getOrdersByFWS - Fetching orders for FWS");
    console.log("════════════════════════════════════════════");
    console.log("📥 FWS User ID:", fwsUserId);
    console.log("📥 FWS User ID Type:", typeof fwsUserId);

    const fws = await FWSWareHouse.findOne({
      userId: fwsUserId,
      status: "ACTIVE",
    });

    if (!fws) {
      console.error(`❌ FWS not found or not active for userId: ${fwsUserId}`);
      throw new Error("FWS not found or not active");
    }

    console.log("✅ FWS User Validated:");
    console.log("  - FWS Code:", fws.fwsCode);
    console.log("  - FWS Name:", fws.name);
    console.log("  - FWS User ID:", fws.userId);
    console.log("  - FWS Status:", fws.status);
    console.log("  - FWS City:", fws.city);

    const fwsUserIdStr = fws.userId.toString();

    console.log("🔄 Finding tracking records with FWS in history...");
    console.log("🔍 Query: trackingHistory.$elemMatch", {
      holderType: "FWS",
      holderId: fwsUserIdStr,
    });

    const trackings = await DeliveryTracking.find({
      trackingHistory: {
        $elemMatch: {
          holderType: "FWS",
          holderId: fwsUserIdStr,
        },
      },
    }).sort({ createdAt: -1 });

    console.log(`📊 Found ${trackings.length} tracking records`);

    if (trackings.length === 0) {
      console.log("⚠️ No tracking records found for this FWS");
      return {
        success: true,
        data: {
          currentOrders: [],
          previousOrders: [],
          total: 0,
          currentCount: 0,
          previousCount: 0,
        },
        message: "No orders found for this FWS",
      };
    }

    console.log("🔄 Processing tracking records...");

    const ordersWithTracking: FWSOrderWithTracking[] = [];

    for (let i = 0; i < trackings.length; i++) {
      const tracking = trackings[i];
      console.log(`  📦 Processing ${i + 1}/${trackings.length}:`);
      console.log(`     Order ID: ${tracking.orderId}`);
      console.log(`     Tracking ID: ${tracking.trackingId}`);
      console.log(`     Current Holder Type: ${tracking.currentHolderType}`);
      console.log(`     Current Holder ID: ${tracking.currentHolderId}`);

      const order = await Order.findOne({ orderId: tracking.orderId });

      if (!order) {
        console.log(
          `     ⚠️ Order not found for tracking: ${tracking.orderId}`,
        );
        continue;
      }

      const isCurrentOrder =
        tracking.currentHolderType === "FWS" &&
        tracking.currentHolderId === fwsUserIdStr;

      console.log(`     ✅ Order found: ${order.orderId}`);
      console.log(
        `     📌 Is Current Order: ${isCurrentOrder ? "✅ YES" : "❌ NO"}`,
      );
      console.log(`     📦 Fulfillment Type: ${order.fulfillmentType}`);
      console.log(`     👤 Buyer: ${order.buyerName || "N/A"}`);
      console.log(`     💰 Amount: ₹${order.finalAmount}`);

      ordersWithTracking.push({
        order,
        tracking,
        isCurrentOrder,
      });
    }

    const currentOrders = ordersWithTracking.filter(
      (item) => item.isCurrentOrder === true,
    );

    const previousOrders = ordersWithTracking.filter(
      (item) => item.isCurrentOrder === false,
    );

    console.log("════════════════════════════════════════════");
    console.log("📊 FINAL SUMMARY");
    console.log("════════════════════════════════════════════");
    console.log(`📦 Total Orders: ${ordersWithTracking.length}`);
    console.log(`✅ Current Orders (in FWS): ${currentOrders.length}`);
    console.log(`📦 Previous Orders (history): ${previousOrders.length}`);
    console.log("════════════════════════════════════════════");

    return {
      success: true,
      data: {
        currentOrders,
        previousOrders,
        total: ordersWithTracking.length,
        currentCount: currentOrders.length,
        previousCount: previousOrders.length,
      },
      message: "Orders fetched successfully",
    };
  }

  static async getOrdersByShippingPartner(userId: string) {
    const { shipping } = await this.validateShippingPartner(userId);

    console.log("\n========== SHIPPING ORDERS DEBUG ==========");
    console.log("UserId:", userId);
    console.log("Shipping Type:", shipping.shippingType);
    console.log("Shipping Name:", shipping.name);

    const objectId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : null;

    const query: any = {
      $or: [
        {
          "pendingAssignment.assigneeId": userId,
          "pendingAssignment.status": "PENDING_ACCEPTANCE",
        },
        ...(objectId
          ? [
              {
                "currentShipping.shippingUserId": objectId,
              },
            ]
          : []),
      ],
    };

    console.log("\nQuery:");
    console.dir(query, { depth: null });

    const trackings = await DeliveryTracking.find(query)
      .sort({ createdAt: -1 })
      .lean();

    console.log("\nTrackings Found:", trackings.length);

    trackings.forEach((t: any) => {
      console.log("================================");
      console.log("orderId:", t.orderId);
      console.log(
        "shippingUserId:",
        t.currentShipping?.shippingUserId?.toString(),
      );
      console.log("currentHolderId:", t.currentHolderId);
      console.log("currentHolderType:", t.currentHolderType);
      console.log("currentStatus:", t.currentStatus);
      console.log("pendingAssignment.status:", t.pendingAssignment?.status);

      const matchByShipping =
        t.currentShipping?.shippingUserId?.toString() === userId;
      const matchByPending =
        t.pendingAssignment?.assigneeId?.toString?.() === userId &&
        t.pendingAssignment?.status === "PENDING_ACCEPTANCE";

      console.log("matchByShipping:", matchByShipping);
      console.log("matchByPending:", matchByPending);
    });

    const ordersWithTracking = await Promise.all(
      trackings.map(async (tracking) => ({
        order: await Order.findOne({ orderId: tracking.orderId }),
        tracking,
      })),
    );

    // Current Orders: pending, accepted, in_transit, ready_for_dispatch
    const currentOrders = ordersWithTracking.filter((ot) => {
      const status = ot.tracking?.currentStatus;
      const pendingStatus = ot.tracking?.pendingAssignment?.status;

      return (
        [
          "assignment_accepted",
          "in_transit",
          "ready_for_dispatch",
          "assignment_sent",
        ].includes(status) || pendingStatus === "PENDING_ACCEPTANCE"
      );
    });

    const deliveredOrders = ordersWithTracking.filter(
      (ot) => ot.tracking?.currentStatus === "delivered",
    );

    const currentCount = currentOrders.length;
    const deliveredCount = deliveredOrders.length;
    const totalCount = ordersWithTracking.length;

    console.log("================================");
    console.log("Total Orders:", totalCount);
    console.log("Current Orders (pending + active):", currentCount);
    console.log("Delivered Orders:", deliveredCount);
    console.log("Remaining:", totalCount - deliveredCount);
    console.log("================================\n");

    return {
      orders: ordersWithTracking,
      stats: {
        current: currentCount,
        delivered: deliveredCount,
        total: totalCount,
        remaining: totalCount - deliveredCount,
      },
    };
  }

  static async getOrderById(orderId: string) {
    console.log("═══════════════════════════════════════");
    console.log("🔍 GET ORDER BY ID");
    console.log("═══════════════════════════════════════");
    console.log("📥 Order ID:", orderId);

    const order = await Order.findOne({ orderId }).lean();

    if (!order) {
      console.log("❌ Order not found");
      throw new Error("Order not found");
    }

    return order;
  }
}
