import { Request, Response } from "express";
import DeliveryTracking from "../../../../models/tizzyos/shipping/order/deliveryTracking";

export const getTrackingStatus = async (req: Request, res: Response) => {
  console.log("\n🔍 ========== GET TRACKING STATUS ==========");
  console.log(`📌 Request Time: ${new Date().toISOString()}`);
  console.log(`📌 Query Params:`, req.query);

  try {
    const { orderId } = req.query;

    console.log(`📦 Order ID Received: "${orderId}"`);
    console.log(`📦 Order ID Type: ${typeof orderId}`);
    console.log(`📦 Order ID Length: ${orderId?.length || 0}`);

    if (!orderId) {
      console.log("❌ ERROR: orderId is missing in query parameters");
      console.log("==========================================\n");
      return res.status(400).json({
        success: false,
        message: "orderId required",
      });
    }

    console.log(`🔍 Querying DeliveryTracking for orderId: "${orderId}"`);

    const tracking = await DeliveryTracking.findOne({
      orderId,
    }).lean();

    const trackingDoc: any = Array.isArray(tracking) ? tracking[0] : tracking;

    console.log("\n📊 ========== TRACKING DATA RETRIEVED ==========");
    console.log(`✅ Tracking found: ${!!trackingDoc}`);

    if (!trackingDoc) {
      console.log(`❌ No tracking document found for orderId: "${orderId}"`);
      console.log("==========================================\n");
      return res.status(404).json({
        success: false,
        message: "Tracking not found",
      });
    }

    // Log full tracking document structure
    console.log("\n📋 ========== FULL TRACKING DOCUMENT ==========");
    console.log(`🔑 orderId: ${trackingDoc.orderId}`);
    console.log(`🏷️ trackingId: ${trackingDoc.trackingId || "MISSING"}`);
    console.log(`📊 currentStatus: ${trackingDoc.currentStatus || "MISSING"}`);
    console.log(
      `👤 currentHolderType: ${trackingDoc.currentHolderType || "MISSING"}`,
    );
    console.log(
      `🆔 currentHolderId: ${trackingDoc.currentHolderId || "MISSING"}`,
    );
    console.log(
      `📛 currentHolderName: ${trackingDoc.currentHolderName || "MISSING"}`,
    );
    console.log(
      `🏢 fulfillmentType: ${trackingDoc.fulfillmentType || "MISSING"}`,
    );
    console.log(JSON.stringify(trackingDoc.qrOwnershipHistory, null, 2));
    // Log Pending Assignment
    console.log("\n📌 ========== PENDING ASSIGNMENT ==========");
    if (trackingDoc.pendingAssignment) {
      console.log(`✅ PENDING ASSIGNMENT EXISTS`);
      console.log(
        `   assignmentId: ${trackingDoc.pendingAssignment.assignmentId}`,
      );
      console.log(`   assigneeId: ${trackingDoc.pendingAssignment.assigneeId}`);
      console.log(
        `   assigneeType: ${trackingDoc.pendingAssignment.assigneeType}`,
      );
      console.log(`   status: ${trackingDoc.pendingAssignment.status}`);
      console.log(`   assignedAt: ${trackingDoc.pendingAssignment.assignedAt}`);
      console.log(
        `   assignmentType: ${trackingDoc.pendingAssignment.assignmentType}`,
      );
      console.log(
        `   distance: ${trackingDoc.pendingAssignment.distance || "N/A"}`,
      );
    } else {
      console.log(`❌ NO PENDING ASSIGNMENT`);
    }

    // Log QR Ownership History
    console.log("\n📱 ========== QR OWNERSHIP HISTORY ==========");
    if (
      trackingDoc.qrOwnershipHistory &&
      trackingDoc.qrOwnershipHistory.length > 0
    ) {
      console.log(
        `✅ QR History Entries: ${trackingDoc.qrOwnershipHistory.length}`,
      );

      trackingDoc.qrOwnershipHistory.forEach((entry: any, index: number) => {
        console.log(`\n   Entry #${index + 1}:`);
        console.log(`   ├─ holderId: ${entry.holderId}`);
        console.log(`   ├─ holderType: ${entry.holderType}`);
        console.log(`   ├─ holderName: ${entry.holderName || "N/A"}`);
        console.log(`   ├─ receivedAt: ${entry.receivedAt}`);
        console.log(`   └─ releasedAt: ${entry.releasedAt || "ACTIVE (null)"}`);
      });

      // Find active entry
      const activeEntry = trackingDoc.qrOwnershipHistory.find(
        (entry: any) => entry.releasedAt === null,
      );

      console.log(`\n🎯 ACTIVE QR OWNER:`);
      if (activeEntry) {
        console.log(`   ✅ Found active entry:`);
        console.log(`   ├─ holderId: ${activeEntry.holderId}`);
        console.log(`   ├─ holderType: ${activeEntry.holderType}`);
        console.log(`   └─ holderName: ${activeEntry.holderName || "N/A"}`);
      } else {
        console.log(
          `   ❌ NO active QR ownership (all entries have releasedAt)`,
        );
      }
    } else {
      console.log(`❌ NO QR OWNERSHIP HISTORY`);
    }

    // Log Tracking History (Last 5 entries)
    console.log("\n🕐 ========== TRACKING HISTORY (Last 5) ==========");
    if (trackingDoc.trackingHistory && trackingDoc.trackingHistory.length > 0) {
      console.log(`✅ Total Entries: ${trackingDoc.trackingHistory.length}`);

      const lastEntries = trackingDoc.trackingHistory.slice(-5);
      lastEntries.forEach((entry: any, index: number) => {
        const entryNum = trackingDoc.trackingHistory.length - 5 + index + 1;
        console.log(`\n   Entry #${entryNum}:`);
        console.log(`   ├─ status: ${entry.status}`);
        console.log(`   ├─ holderType: ${entry.holderType}`);
        console.log(`   ├─ holderId: ${entry.holderId}`);
        console.log(`   ├─ holderName: ${entry.holderName || "N/A"}`);
        console.log(`   ├─ note: ${entry.note || "N/A"}`);
        console.log(`   └─ createdAt: ${entry.createdAt}`);
      });
    } else {
      console.log(`❌ NO TRACKING HISTORY`);
    }

    // Log Route History
    console.log("\n🗺️ ========== ROUTE HISTORY ==========");
    if (trackingDoc.routeHistory && trackingDoc.routeHistory.length > 0) {
      console.log(
        `✅ Route History Entries: ${trackingDoc.routeHistory.length}`,
      );

      trackingDoc.routeHistory.forEach((entry: any, index: number) => {
        console.log(`\n   Route #${index + 1}:`);
        console.log(
          `   ├─ from: ${entry.fromHolderType} (${entry.fromHolderId})`,
        );
        console.log(`   ├─ to: ${entry.toHolderType} (${entry.toHolderId})`);
        console.log(
          `   ├─ scannedBy: ${entry.scannedByName || entry.scannedByUserId}`,
        );
        console.log(`   ├─ scanType: ${entry.scanType || "N/A"}`);
        console.log(`   └─ transferredAt: ${entry.transferredAt}`);
      });
    } else {
      console.log(`❌ NO ROUTE HISTORY`);
    }

    // Log Current Location
    console.log("\n📍 ========== CURRENT LOCATION ==========");
    if (trackingDoc.currentLocation) {
      console.log(
        `   Address: ${trackingDoc.currentLocation.address || "N/A"}`,
      );
      console.log(
        `   Latitude: ${trackingDoc.currentLocation.latitude || "N/A"}`,
      );
      console.log(
        `   Longitude: ${trackingDoc.currentLocation.longitude || "N/A"}`,
      );
      console.log(
        `   Updated At: ${trackingDoc.currentLocation.updatedAt || "N/A"}`,
      );
    } else {
      console.log(`   ❌ No current location`);
    }

    // Log Current FWS
    console.log("\n🏢 ========== CURRENT FWS ==========");
    if (trackingDoc.currentFWS) {
      console.log(`   userId: ${trackingDoc.currentFWS.userId}`);
      console.log(`   fwsCode: ${trackingDoc.currentFWS.fwsCode}`);
      console.log(`   fwsName: ${trackingDoc.currentFWS.fwsName}`);
      console.log(`   city: ${trackingDoc.currentFWS.city || "N/A"}`);
      console.log(
        `   processingStage: ${trackingDoc.currentFWS.processingStage || "N/A"}`,
      );
      console.log(`   updatedAt: ${trackingDoc.currentFWS.updatedAt}`);
    } else {
      console.log(`   ❌ No current FWS`);
    }

    // Log Current Shipping
    console.log("\n🚚 ========== CURRENT SHIPPING ==========");
    if (trackingDoc.currentShipping) {
      console.log(
        `   shippingUserId: ${trackingDoc.currentShipping.shippingUserId}`,
      );
      console.log(
        `   shippingName: ${trackingDoc.currentShipping.shippingName}`,
      );
      console.log(
        `   shippingType: ${trackingDoc.currentShipping.shippingType}`,
      );
      console.log(`   updatedAt: ${trackingDoc.currentShipping.updatedAt}`);
    } else {
      console.log(`   ❌ No current shipping`);
    }

    // Log Statistics
    console.log("\n📊 ========== STATISTICS ==========");
    console.log(`   totalFWSVisited: ${trackingDoc.totalFWSVisited || 0}`);
    console.log(
      `   totalRidersInvolved: ${trackingDoc.totalRidersInvolved || 0}`,
    );
    console.log(
      `   totalTrucksInvolved: ${trackingDoc.totalTrucksInvolved || 0}`,
    );

    // Prepare response data
    const responseData = {
      success: true,
      orderId: trackingDoc.orderId,
      fulfillmentType: trackingDoc.fulfillmentType,
      pendingAssignment: trackingDoc.pendingAssignment || null,
      trackingHistory: trackingDoc.trackingHistory || [],
      qrOwnershipHistory: trackingDoc.qrOwnershipHistory || [],
      route: trackingDoc.route || [],
      routeHistory: trackingDoc.routeHistory || [],
      updatedAt: trackingDoc.updatedAt,
      // Additional fields for debugging (remove in production if needed)
      _debug: {
        currentStatus: trackingDoc.currentStatus,
        currentHolderType: trackingDoc.currentHolderType,
        currentHolderId: trackingDoc.currentHolderId,
        currentHolderName: trackingDoc.currentHolderName,
        hasPendingAssignment: !!trackingDoc.pendingAssignment,
        activeQROwner:
          trackingDoc.qrOwnershipHistory?.find(
            (entry: any) => entry.releasedAt === null,
          ) || null,
        trackingId: trackingDoc.trackingId,
      },
    };

    console.log("\n✅ ========== RESPONSE SUMMARY ==========");
    console.log(`📦 Order ID: ${responseData.orderId}`);
    console.log(`🏷️ Fulfillment Type: ${responseData.fulfillmentType}`);
    console.log(
      `📌 Pending Assignment: ${responseData.pendingAssignment ? "YES" : "NO"}`,
    );
    if (responseData.pendingAssignment) {
      console.log(`   └─ Status: ${responseData.pendingAssignment.status}`);
      console.log(
        `   └─ Assignee: ${responseData.pendingAssignment.assigneeId}`,
      );
    }
    console.log(
      `📱 QR History Entries: ${responseData.qrOwnershipHistory.length}`,
    );
    if (responseData.qrOwnershipHistory.length > 0) {
      const activeQR = responseData.qrOwnershipHistory.find(
        (e: any) => e.releasedAt === null,
      );
      console.log(
        `   └─ Active QR Owner: ${activeQR ? activeQR.holderType + " (ID: " + activeQR.holderId + ")" : "NONE"}`,
      );
    }
    console.log(
      `🕐 Tracking History Entries: ${responseData.trackingHistory.length}`,
    );
    console.log(
      `🗺️ Route History Entries: ${responseData.routeHistory.length}`,
    );
    console.log("==========================================\n");

    return res.status(200).json(responseData);
  } catch (err) {
    console.error("\n❌ ========== TRACKING FETCH ERROR ==========");
    console.error(`Error Time: ${new Date().toISOString()}`);
    console.error(
      `Error Type: ${err instanceof Error ? err.constructor.name : "Unknown"}`,
    );
    console.error(
      `Error Message: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.error(
      `Error Stack:`,
      err instanceof Error ? err.stack : "No stack trace",
    );
    console.error("==========================================\n");

    return res.status(500).json({
      success: false,
      message: "Failed to fetch tracking status",
      error:
        process.env.NODE_ENV === "development"
          ? err instanceof Error
            ? err.message
            : String(err)
          : undefined,
    });
  }
};
