import { Request, Response } from "express";
import mongoose from "mongoose";
import Shipper from "../../../../models/tizzyos/shipping/order/order";
import Register from "../../../../models/tizzyos/shipping/fws/fwsRegistration";
import ShipperRiderLocation from "../../../../models/tizzyos/shipping/fws/fwsRiderLocation";
import {
  getDistanceAndDuration,
  geocodeAddress,
} from "../../../../utils/tizzyos/shippings/googleAPI";

// ========== TYPE DEFINITIONS ==========

interface AuthenticatedUser {
  id: string;
  _id: string;
  userId: string;
  role?: string;
  [key: string]: any;
}

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

// ========== CONSTANTS & CONFIGURATION ==========

const PROXIMITY_THRESHOLD_METERS = parseInt(
  process.env.PROXIMITY_THRESHOLD_METERS || "100",
);
const TOP_CANDIDATES_COUNT = parseInt(process.env.TOP_CANDIDATES_COUNT || "10");
const GOOGLE_API_CANDIDATES_COUNT = parseInt(
  process.env.GOOGLE_API_CANDIDATES_COUNT || "3",
);
const LOCATION_UPDATE_DEBOUNCE_MS = parseInt(
  process.env.LOCATION_UPDATE_DEBOUNCE_MS || "1000",
);

// ========== AUTO MODE DISTANCE CONSTANTS (FIXED) ==========
const MIN_RIDER_ASSIGNMENT_DISTANCE_KM = 0.001; // 1 meter minimum
const MAX_RIDER_ASSIGNMENT_DISTANCE_KM = 50; // 50 KM maximum as per requirements

// ========== HELPER FUNCTIONS ==========

/**
 * Extract userId from JWT token
 */
function getUserIdFromAuth(req: Request): string {
  const authenticatedReq = req as AuthenticatedRequest;

  if (!authenticatedReq.user?.userId) {
    throw new Error("Invalid token: userId missing");
  }

  return authenticatedReq.user.userId.toString();
}

/**
 * Get shipping profile from Register collection using userId
 */
async function getShippingProfile(userId: string) {
  const shipping = await Register.findOne({ userId });

  if (!shipping) {
    throw new Error(
      "Shipping profile not found. Please complete registration.",
    );
  }

  if (shipping.kyc?.status !== "verified") {
    throw new Error("KYC not approved. Please complete KYC verification.");
  }

  return {
    shippingId: shipping.shippingId,
    shippingType: shipping.shippingType,
    originalDoc: shipping,
  };
}

/**
 * Propagate rider location to active orders
 * Updated to use shippingId instead of riderId
 */
async function propagateRiderLocationToActiveOrders(
  userId: mongoose.Types.ObjectId,
  shippingId: string,
  location: any,
): Promise<number> {
  const LOCATION_UPDATE_STATUSES = [
    "assigned",
    "picked_up",
    "in_transit",
    "out_for_delivery",
  ];

  try {
    // Find active orders assigned to this rider using shippingId
    const activeOrders = await Shipper.find({
      shippingId: shippingId, // Using shippingId as business identifier
      deliveryStatus: { $in: LOCATION_UPDATE_STATUSES },
    });

    if (activeOrders.length === 0) {
      console.log(`No active orders found for shippingId: ${shippingId}`);
      return 0;
    }

    console.log(
      `Found ${activeOrders.length} active orders for shippingId: ${shippingId}`,
    );

    // Update each order with the rider's current location
    const updatePromises = activeOrders.map((order) =>
      Shipper.updateOne(
        { _id: order._id },
        {
          $set: {
            riderLocation: {
              latitude: location.latitude,
              longitude: location.longitude,
              address: location.address,
              googlePlaceId: location.googlePlaceId,
              updatedAt: new Date(),
            },
            lastLocationUpdate: new Date(),
          },
        },
      ),
    );

    await Promise.all(updatePromises);

    console.log(
      `✅ Propagated location to ${activeOrders.length} orders for shippingId: ${shippingId}`,
    );
    return activeOrders.length;
  } catch (error) {
    console.error("Error propagating location to orders:", error);
    return 0;
  }
}

// ========== REFACTORED CONTROLLER ==========

export const riderLocationController = async (req: Request, res: Response) => {
  try {
    console.log("🚀 ========== riderLocationController START ==========");

    // Step 1: Extract userId from JWT
    const userId = getUserIdFromAuth(req);
    console.log("✅ Extracted userId from token:", userId);

    // Step 2: Get shipping profile using userId
    console.log("🔍 Looking up shipping profile with userId:", userId);
    const {
      shippingId,
      shippingType,
      originalDoc: shipping,
    } = await getShippingProfile(userId);

    console.log("✅ Found shipping profile:");
    console.log("   - shippingId:", shippingId);
    console.log("   - shippingType:", shippingType);
    console.log("   - KYC status:", shipping.kyc?.status);

    const { action, latitude, longitude } = req.body;
    console.log("✅ Action from body:", action);

    // 🔥 FRONTEND LOCATION RECEIVED LOG 🔥
    if (action === "update" && latitude && longitude) {
      console.log("📍📍📍 FRONTEND LOCATION RECEIVED 📍📍📍");
      console.log(`📍 Coordinates: ${latitude}, ${longitude}`);
      console.log(`📍 Shipping ID: ${shippingId}`);
      console.log(`📍 Shipping Type: ${shippingType}`);
      console.log(`📍 Timestamp: ${new Date().toISOString()}`);
      console.log("📍📍📍 LOCATION SAVING STARTING 📍📍📍");
    }

    if (!action) {
      return res.status(400).json({
        success: false,
        message: "action is required",
      });
    }

    // ========== ACTION: START TRACKING ==========
    if (action === "start") {
      console.log("🔄 Action: START location tracking");

      // Start location tracking - Save to ShipperRiderLocation using userId
      const result = await ShipperRiderLocation.findOneAndUpdate(
        { userId }, // Use userId for document lookup
        {
          $set: {
            userId: new mongoose.Types.ObjectId(userId),
            shippingId: shippingId,
            shippingType: shippingType,
            isTrackingOn: true,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true, new: true },
      );

      console.log("✅ ShipperRiderLocation update result:", result);

      // Update Register collection to reflect tracking status
      await Register.updateOne(
        { userId: new mongoose.Types.ObjectId(userId) },
        {
          $set: {
            isLocationTracking: true,
            updatedAt: new Date(),
          },
        },
      );

      return res.json({
        success: true,
        message: "Rider location tracking started",
        data: {
          shippingId: shippingId,
          shippingType: shippingType,
          documentId: result?._id,
          isTrackingOn: true,
        },
      });
    }

    // ========== ACTION: STOP TRACKING ==========
    if (action === "stop") {
      console.log("🔄 Action: STOP location tracking");

      // Stop location tracking
      await Promise.all([
        ShipperRiderLocation.updateOne(
          { userId: new mongoose.Types.ObjectId(userId) },
          {
            $set: {
              isTrackingOn: false,
              updatedAt: new Date(),
            },
          },
        ),
        Register.updateOne(
          { userId: new mongoose.Types.ObjectId(userId) },
          {
            $set: {
              isLocationTracking: false,
              updatedAt: new Date(),
            },
          },
        ),
      ]);

      return res.json({
        success: true,
        message: "Rider location tracking stopped",
        data: {
          shippingId: shippingId,
          shippingType: shippingType,
        },
      });
    }

    // ========== ACTION: UPDATE LOCATION ==========
    if (action === "update") {
      console.log("🔄 Action: UPDATE location");

      // Validate coordinates
      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: "latitude and longitude are required",
        });
      }

      console.log("🔍 Checking if tracking document exists...");
      let riderTracking = await ShipperRiderLocation.findOne({
        userId: new mongoose.Types.ObjectId(userId),
      });

      // Create document if doesn't exist
      if (!riderTracking) {
        console.log(
          "⚠️ No tracking document found, creating one automatically...",
        );

        riderTracking = await ShipperRiderLocation.findOneAndUpdate(
          { userId: new mongoose.Types.ObjectId(userId) },
          {
            $set: {
              userId: new mongoose.Types.ObjectId(userId),
              shippingId: shippingId,
              shippingType: shippingType,
              isTrackingOn: true,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          { upsert: true, new: true },
        );

        console.log("✅ Created new tracking document:", riderTracking?._id);

        await Register.updateOne(
          { userId: new mongoose.Types.ObjectId(userId) },
          {
            $set: {
              isLocationTracking: true,
              updatedAt: new Date(),
            },
          },
        );
      }

      console.log(
        "✅ Found/created riderTracking document:",
        riderTracking?._id,
      );

      // Auto-enable tracking if it's off
      if (!riderTracking?.isTrackingOn) {
        console.log("⚠️ Tracking is OFF, auto-enabling it...");

        await ShipperRiderLocation.updateOne(
          { userId: new mongoose.Types.ObjectId(userId) },
          {
            $set: {
              isTrackingOn: true,
              updatedAt: new Date(),
            },
          },
        );

        await Register.updateOne(
          { userId: new mongoose.Types.ObjectId(userId) },
          {
            $set: {
              isLocationTracking: true,
              updatedAt: new Date(),
            },
          },
        );
      }

      // ========== OPTIMIZED GEOCODING - ONLY ONCE ==========
      let address: string = "Unknown Location";
      let placeId: string | undefined = undefined;

      console.log("🔍 Checking for existing address in database...");

      // Fetch existing location document to check if we already have address
      const existingLocation = await ShipperRiderLocation.findOne(
        { userId: new mongoose.Types.ObjectId(userId) },
        {
          "location.address": 1,
          "location.googlePlaceId": 1,
          "location.latitude": 1,
          "location.longitude": 1,
        },
      );

      // Check if we already have address and googlePlaceId saved
      const hasExistingAddress = !!(
        existingLocation?.location?.address &&
        existingLocation.location.address !== "Unknown Location" &&
        existingLocation.location.googlePlaceId
      );

      if (!hasExistingAddress) {
        // FIRST TIME - Call Google API once
        console.log(
          "📍 FIRST LOCATION UPDATE - Calling Google API for address...",
        );
        try {
          const geocodeResult = await geocodeAddress(latitude, longitude);
          address = geocodeResult.address;
          placeId = geocodeResult.placeId;
          console.log(`✅ Address obtained: ${address}`);
          console.log(`✅ Place ID: ${placeId}`);
        } catch (err: any) {
          console.warn(`⚠️ Geocoding failed:`, err.message || err);
          address = `Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        }
      } else {
        // FUTURE UPDATES - Use existing address, don't call Google API
        console.log(
          "📍 SUBSEQUENT LOCATION UPDATE - Using cached address (NO Google API call)",
        );
        // Safe assignment with null checks
        if (existingLocation?.location?.address) {
          address = existingLocation.location.address;
        }
        if (existingLocation?.location?.googlePlaceId) {
          placeId = existingLocation.location.googlePlaceId;
        }
        console.log(`✅ Using cached address: ${address}`);
      }

      // Create location payload based on whether it's first time or not
      let locationPayload: any = {
        latitude,
        longitude,
        updatedAt: new Date(),
      };

      // Only save address and placeId on first update
      if (!hasExistingAddress) {
        locationPayload.address = address;
        locationPayload.googlePlaceId = placeId;
        console.log("💾 Saving location WITH address (first time)");
      } else {
        console.log(
          "💾 Saving location WITHOUT address (keeping existing address)",
        );
      }

      console.log("💾 Saving location to ShipperRiderLocation...");

      // Build update object - only update fields that should change
      const updateObject: any = {
        userId: new mongoose.Types.ObjectId(userId),
        shippingId: shippingId,
        shippingType: shippingType,
        updatedAt: new Date(),
      };

      // For location, we want to preserve existing address if we have it
      if (hasExistingAddress && existingLocation?.location) {
        // Update only latitude, longitude, and updatedAt
        updateObject["location.latitude"] = latitude;
        updateObject["location.longitude"] = longitude;
        updateObject["location.updatedAt"] = new Date();
      } else {
        // First time - set full location object
        updateObject.location = locationPayload;
      }

      // Save location to ShipperRiderLocation using userId
      const updateResult = await ShipperRiderLocation.updateOne(
        { userId: new mongoose.Types.ObjectId(userId) },
        { $set: updateObject },
      );

      console.log("✅ ShipperRiderLocation update result:", updateResult);

      // Verify the document was saved
      const savedDoc = await ShipperRiderLocation.findOne({
        userId: new mongoose.Types.ObjectId(userId),
      });
      console.log("✅ Saved document verification:", {
        hasDoc: savedDoc ? "YES" : "NO",
        userIdInDoc: savedDoc?.userId,
        shippingIdInDoc: savedDoc?.shippingId,
        shippingTypeInDoc: savedDoc?.shippingType,
        hasLocation: savedDoc?.location ? "YES" : "NO",
        hasAddress: savedDoc?.location?.address ? "YES" : "NO",
        addressSaved: savedDoc?.location?.address?.substring(0, 50),
      });

      // Propagate location to active orders using shippingId as business identifier
      console.log("🔄 Propagating location to active orders...");

      // For order propagation, include address if we have it
      const orderLocationPayload = {
        latitude,
        longitude,
        address: address,
        googlePlaceId: placeId,
        updatedAt: new Date(),
      };

      const propagatedCount = await propagateRiderLocationToActiveOrders(
        new mongoose.Types.ObjectId(userId),
        shippingId,
        orderLocationPayload,
      );

      const activeOrders = await Shipper.find({
        shippingId: shippingId, // Using shippingId as the rider identifier
        deliveryStatus: {
          $in: ["assigned", "picked_up", "in_transit", "out_for_delivery"],
        },
      }).select("orderId deliveryStatus riderLocation");

      console.log("✅ Active orders count:", activeOrders.length);

      // 🔥 FRONTEND LOCATION SAVED LOG 🔥
      if (action === "update" && latitude && longitude) {
        console.log("📍📍📍 LOCATION SUCCESSFULLY SAVED 📍📍📍");
        console.log(`📍 Saved to database: ${latitude}, ${longitude}`);
        console.log(`📍 Shipping ID: ${shippingId}`);
        console.log(`📍 Shipping Type: ${shippingType}`);
        console.log(`📍 Time: ${new Date().toISOString()}`);
        console.log(`📍 Address: ${address.substring(0, 50)}...`);
        console.log(`📍 Orders updated: ${propagatedCount}`);
        console.log(
          `📍 First time address fetch: ${!hasExistingAddress ? "YES" : "NO"}`,
        );
        console.log("📍📍📍 LOCATION UPDATE COMPLETED 📍📍📍");
      }

      // Get the final saved location to return
      const finalLocation = await ShipperRiderLocation.findOne(
        { userId: new mongoose.Types.ObjectId(userId) },
        { location: 1 },
      );

      return res.json({
        success: true,
        message: hasExistingAddress
          ? "Location updated successfully (using cached address)"
          : "Location updated successfully with new address",
        data: {
          shippingId: shippingId,
          shippingType: shippingType,
          riderLocation: finalLocation?.location || locationPayload,
          ordersUpdated: propagatedCount,
          activeOrdersCount: activeOrders.length,
          activeOrders: activeOrders.map((order) => ({
            orderId: order.orderId,
            deliveryStatus: order.deliveryStatus,
            riderLocation: order.riderLocation,
          })),
          note: hasExistingAddress
            ? "Location saved - address preserved from first update"
            : "First location update - address obtained from Google API",
        },
      });
    }

    // ========== ACTION: GET LOCATION ==========
    if (action === "get") {
      console.log("🔄 Action: GET location");

      // Get current location from ShipperRiderLocation using userId
      const riderTracking = await ShipperRiderLocation.findOne({
        userId: new mongoose.Types.ObjectId(userId),
      });

      if (!riderTracking) {
        const newDoc = await ShipperRiderLocation.create({
          userId: new mongoose.Types.ObjectId(userId),
          shippingId: shippingId,
          shippingType: shippingType,
          isTrackingOn: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        return res.json({
          success: true,
          message: "No tracking data found",
          data: {
            shippingId: newDoc.shippingId,
            shippingType: newDoc.shippingType,
            isTrackingOn: newDoc.isTrackingOn,
            location: null,
            lastUpdated: null,
          },
        });
      }

      return res.json({
        success: true,
        data: {
          shippingId: riderTracking.shippingId,
          shippingType: riderTracking.shippingType,
          isTrackingOn: riderTracking.isTrackingOn,
          location: riderTracking.location,
          lastUpdated: riderTracking.location?.updatedAt,
        },
      });
    }

    // Invalid action
    return res.status(400).json({
      success: false,
      message: "Invalid action. Use 'start', 'stop', 'update', or 'get'",
    });
  } catch (err: any) {
    console.error("❌ riderLocationController error:", err);

    if (
      err.message.includes("userId missing") ||
      err.message.includes("token")
    ) {
      return res.status(401).json({
        success: false,
        message: "Authentication failed: " + err.message,
      });
    }

    if (err.message.includes("Shipping profile not found")) {
      return res.status(404).json({
        success: false,
        message: err.message,
      });
    }

    if (err.message.includes("KYC not approved")) {
      return res.status(403).json({
        success: false,
        message: err.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};
