import { Response } from "express";
import { AuthRequest } from "../../../middleware/tizzygo/authMiddleware";
import {
  getCartCheckout,
  getBuyerLocation,
} from "../../../services/tizzygo/cartCheckoutService";

export const getCartCheckoutHandler = async (
  req: AuthRequest,
  res: Response,
) => {
  console.log("========================================");
  console.log("🛒 [CartCheckoutController] GET CART CHECKOUT");
  console.log("========================================");
  console.log("📅 Timestamp:", new Date().toISOString());
  console.log("📥 Request URL:", req.url);
  console.log("📥 Request Method:", req.method);
  console.log("📥 Request Headers:", JSON.stringify(req.headers, null, 2));
  console.log("📥 Request Query:", JSON.stringify(req.query, null, 2));
  console.log("👤 User:", req.user?.userId || req.user?._id);

  try {
    const userId = req.user?.userId || req.user?._id;
    console.log("🔍 User ID:", userId);

    if (!userId) {
      console.log("❌ [CartCheckoutController] Unauthorized - No userId");
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const { couponCode } = req.query;
    console.log("🏷️ Coupon Code:", couponCode || "None");

    console.log("🔍 Checking buyer location for user:", userId);
    const existingLocation = await getBuyerLocation(userId);
    console.log(
      "📍 Existing Location:",
      existingLocation ? "✅ Found" : "❌ Not Found",
    );

    if (!existingLocation) {
      console.log("❌ No location found for user");
      return res.status(200).json({
        success: true,
        data: {
          hasLocation: false,
        },
      });
    }

    console.log("📍 Location details:");
    console.log("  - Address:", existingLocation.location.address);
    console.log("  - City:", existingLocation.location.city);
    console.log("  - State:", existingLocation.location.state);
    console.log("  - Coordinates:", existingLocation.location.coordinates);
    console.log("  - PinCode:", existingLocation.location.pinCode);

    console.log("🔄 Calling getCartCheckout service...");
    console.log("  - userId:", userId);
    console.log("  - address:", existingLocation.location.address);
    console.log("  - couponCode:", couponCode || "None");

    const result = await getCartCheckout({
      userId,
      address: {
        address: existingLocation.location.address,
        latitude: existingLocation.location.coordinates[1],
        longitude: existingLocation.location.coordinates[0],
        googlePlaceId: (existingLocation.location as any).googlePlaceId || "",
        city: existingLocation.location.city || "",
        state: existingLocation.location.state || "",
        country: existingLocation.location.country || "India",
        pinCode: existingLocation.location.pinCode || "",
        landmark: existingLocation.location.landmark || "",
      },
      couponCode: couponCode as string,
    });

    console.log("✅ getCartCheckout service completed");
    console.log("📊 Result:", JSON.stringify(result, null, 2));

    console.log("✅ [CartCheckoutController] Sending success response");
    console.log("========================================");

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.log("========================================");
    console.log("❌ [CartCheckoutController] ERROR OCCURRED");
    console.log("========================================");
    console.error("🔴 Error Name:", error.name);
    console.error("🔴 Error Message:", error.message);
    console.error("🔴 Error Stack:", error.stack);
    console.error("🔴 Full Error:", JSON.stringify(error, null, 2));
    console.log("========================================");

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to get cart checkout",
    });
  }
};

export const updateCartLocationHandler = async (
  req: AuthRequest,
  res: Response,
) => {
  console.log("========================================");
  console.log("📍 [CartCheckoutController] UPDATE CART LOCATION");
  console.log("========================================");
  console.log("📅 Timestamp:", new Date().toISOString());
  console.log("📥 Request URL:", req.url);
  console.log("📥 Request Method:", req.method);
  console.log("📥 Request Body:", JSON.stringify(req.body, null, 2));
  console.log("👤 User:", req.user?.userId || req.user?._id);

  try {
    const userId = req.user?.userId || req.user?._id;
    console.log("🔍 User ID:", userId);

    if (!userId) {
      console.log("❌ [CartCheckoutController] Unauthorized - No userId");
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const {
      address,
      latitude,
      longitude,
      googlePlaceId,
      city,
      state,
      country,
      pinCode,
      label,
      landmark,
      couponCode,
    } = req.body;

    console.log("📍 Location Data Received:");
    console.log("  - address:", address);
    console.log("  - latitude:", latitude);
    console.log("  - longitude:", longitude);
    console.log("  - googlePlaceId:", googlePlaceId || "None");
    console.log("  - city:", city || "None");
    console.log("  - state:", state || "None");
    console.log("  - country:", country || "India");
    console.log("  - pinCode:", pinCode || "None");
    console.log("  - label:", label || "Home");
    console.log("  - couponCode:", couponCode || "None");

    if (!address || latitude === undefined || longitude === undefined) {
      console.log("❌ [CartCheckoutController] Invalid address data");
      return res.status(400).json({
        success: false,
        error: "Address, latitude, and longitude are required",
      });
    }

    console.log("🔄 Calling getCartCheckout service with new location...");
    const result = await getCartCheckout({
      userId,
      address: {
        address,
        latitude: Number(latitude),
        longitude: Number(longitude),
        googlePlaceId: googlePlaceId || "",
        city: city || "",
        state: state || "",
        country: country || "India",
        pinCode: pinCode || "",
        landmark: landmark || "",
        label: label || "Home",
      },
      couponCode: couponCode || req.body.couponCode,
    });

    console.log("✅ getCartCheckout service completed");
    console.log("📊 Result:", JSON.stringify(result, null, 2));

    console.log("✅ [CartCheckoutController] Sending success response");
    console.log("========================================");

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.log("========================================");
    console.log("❌ [CartCheckoutController] ERROR OCCURRED");
    console.log("========================================");
    console.error("🔴 Error Name:", error.name);
    console.error("🔴 Error Message:", error.message);
    console.error("🔴 Error Stack:", error.stack);
    console.error("🔴 Full Error:", JSON.stringify(error, null, 2));
    console.log("========================================");

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to update cart location",
    });
  }
};
