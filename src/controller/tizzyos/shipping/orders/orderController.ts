import { Request, Response } from "express";
import Order from "../../../../models/tizzygo/checkout/order";
import DeliveryTracking from "../../../../models/tizzyos/shipping/order/deliveryTracking";

// 📦 Fetch seller orders + FULL bulk delivery tracking
export const getSellerOrders = async (req: Request, res: Response) => {
  try {
    const { sellerId } = req.query;

    // =====================================================
    // SELLER ID VALIDATION
    // =====================================================

    if (!sellerId) {
      return res.status(400).json({
        success: false,
        message: "sellerId required",
      });
    }

    console.log("\n📦 ========================================");
    console.log("📦 FETCHING SELLER ORDERS + FULL TRACKING");
    console.log("📦 Seller ID:", sellerId);

    // =====================================================
    // 1️⃣ FETCH SELLER ORDERS
    // =====================================================

    const orders = await Order.find({
      sellerId,
      status: {
        $in: ["captured", "cod_confirmed"],
      },
    })
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ ${orders.length} orders found`);

    // =====================================================
    // 2️⃣ NO ORDERS
    // =====================================================

    if (orders.length === 0) {
      console.log("ℹ️ No orders found for seller");

      return res.status(200).json({
        success: true,
        count: 0,
        trackingCount: 0,
        ordersWithoutTracking: 0,
        orders: [],
      });
    }

    // =====================================================
    // 3️⃣ GET VALID ORDER IDS
    // =====================================================

    const orderIds = orders
      .map((order: any) => order.orderId)
      .filter(
        (orderId: any) =>
          orderId !== undefined && orderId !== null && orderId !== "",
      );

    console.log(`🔎 Order IDs available for tracking: ${orderIds.length}`);

    // =====================================================
    // 4️⃣ BULK FETCH FULL DELIVERY TRACKING
    //
    // IMPORTANT:
    // DeliveryTracking may NOT exist before seller accepts
    // the order.
    //
    // Therefore:
    // - No tracking = normal condition
    // - No tracking MUST NOT fail the Orders API
    // =====================================================

    let trackingRecords: any[] = [];

    if (orderIds.length > 0) {
      try {
        trackingRecords = await DeliveryTracking.find({
          orderId: {
            $in: orderIds,
          },
        }).lean();

        console.log(
          `🚚 Full tracking records found: ${trackingRecords.length}`,
        );
      } catch (trackingError) {
        console.error("⚠️ DeliveryTracking bulk fetch failed:", trackingError);

        // Tracking failure should NOT fail seller orders
        trackingRecords = [];
      }
    }

    // =====================================================
    // 5️⃣ CREATE TRACKING MAP
    // =====================================================

    const trackingMap = new Map<string, any>();

    for (const tracking of trackingRecords) {
      if (tracking && tracking.orderId) {
        trackingMap.set(String(tracking.orderId), tracking);
      }
    }

    // =====================================================
    // 6️⃣ MERGE ORDER + FULL DELIVERY TRACKING
    // =====================================================

    const ordersWithTracking = orders.map((order: any) => {
      const tracking = trackingMap.get(String(order.orderId));

      // =================================================
      // NO DELIVERY TRACKING
      //
      // Usually means seller has not accepted order yet.
      // This is NOT an error.
      // =================================================

      if (!tracking) {
        return {
          ...order,

          // Complete tracking document
          deliveryTracking: null,

          // Convenience fields
          trackingHistory: [],
          qrOwnershipHistory: [],
          pendingAssignment: null,
          route: [],
          routeHistory: [],

          currentStatus: order.status,

          currentHolderType: "SELLER",

          currentHolderId: null,

          currentHolderName: null,

          trackingId: null,

          fulfillmentType: order.fulfillmentType || null,

          currentLocation: null,

          currentFWS: null,

          currentShipping: null,

          trackingUpdatedAt: null,

          hasTracking: false,
        };
      }

      // =================================================
      // DELIVERY TRACKING EXISTS
      //
      // IMPORTANT:
      // Return the COMPLETE DeliveryTracking document.
      // Do NOT manually select tracking fields.
      // =================================================

      return {
        ...order,

        // ===============================================
        // 🔥 COMPLETE DELIVERY TRACKING DOCUMENT
        // ===============================================

        deliveryTracking: tracking,

        // ===============================================
        // Convenience fields
        // These keep your existing frontend compatible.
        // ===============================================

        trackingHistory: tracking.trackingHistory || [],

        qrOwnershipHistory: tracking.qrOwnershipHistory || [],

        pendingAssignment: tracking.pendingAssignment || null,

        route: tracking.route || [],

        routeHistory: tracking.routeHistory || [],

        currentStatus: tracking.currentStatus || order.status,

        currentHolderType: tracking.currentHolderType || "SELLER",

        currentHolderId: tracking.currentHolderId || null,

        currentHolderName: tracking.currentHolderName || null,

        trackingId: tracking.trackingId || null,

        fulfillmentType:
          tracking.fulfillmentType || order.fulfillmentType || null,

        currentLocation: tracking.currentLocation || null,

        currentFWS: tracking.currentFWS || null,

        currentShipping: tracking.currentShipping || null,

        trackingUpdatedAt: tracking.updatedAt || null,

        hasTracking: true,
      };
    });

    // =====================================================
    // 7️⃣ LOG SUMMARY
    // =====================================================

    const withTracking = ordersWithTracking.filter(
      (order: any) => order.hasTracking === true,
    ).length;

    const withoutTracking = ordersWithTracking.length - withTracking;

    console.log("📊 ========================================");

    console.log(`📦 Total Orders: ${ordersWithTracking.length}`);

    console.log(`🚚 With Full Tracking: ${withTracking}`);

    console.log(`⏳ Without Tracking: ${withoutTracking}`);

    console.log("📊 ========================================\n");

    // =====================================================
    // 8️⃣ RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,

      count: ordersWithTracking.length,

      trackingCount: withTracking,

      ordersWithoutTracking: withoutTracking,

      orders: ordersWithTracking,
    });
  } catch (err) {
    // =====================================================
    // MAIN ERROR
    // =====================================================

    console.error("❌ Seller orders fetch error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch seller orders",
    });
  }
};
