import { Request, Response } from "express";
import Shipper from "../../../../models/tizzygo/order/order";
import User from "../../../../models/tizzygo/auths/User";
import { haversineDistance } from "../../../../utils/tizzyos/shippings/haversine";

export const getRiderLiveCoordinates = async (req: Request, res: Response) => {
  try {
    console.log("🚀 [API] /api/track/rider-location/:riderId called");
    console.log("📝 Request params:", req.params);
    console.log("📝 Request riderId:", req.params.riderId);

    const { riderId } = req.params;

    if (!riderId) {
      console.log("❌ [ERROR] riderId is required");
      return res.status(400).json({
        success: false,
        message: "riderId is required",
      });
    }

    console.log("🔍 [DATABASE] Finding order for riderId:", riderId);
    
    const order = await Shipper.findOne({
      riderId,
      deliveryStatus: { $ne: "delivered" },
    })
      .select(
        "orderId deliveryStatus riderLocation sellerAddress buyerAddress sellerId buyerId updatedAt"
      )
      .sort({ updatedAt: -1 });

    console.log("✅ [DATABASE] Order query result:", {
      found: !!order,
      orderId: order?.orderId,
      deliveryStatus: order?.deliveryStatus,
      hasRiderLocation: !!order?.riderLocation
    });

    if (!order) {
      console.log("❌ [ERROR] No active order found for riderId:", riderId);
      return res.status(404).json({
        success: false,
        message: "Active order not found",
      });
    }

    if (!order.riderLocation) {
      console.log("❌ [ERROR] Rider location not found for order:", order.orderId);
      return res.status(404).json({
        success: false,
        message: "Rider location not found",
      });
    }

    console.log("📍 [LOCATION] Rider coordinates:", {
      latitude: order.riderLocation.latitude,
      longitude: order.riderLocation.longitude,
      updatedAt: order.riderLocation.updatedAt
    });

    const riderLat = order.riderLocation.latitude;
    const riderLng = order.riderLocation.longitude;

    let target = null;
    let distance = null;
    let enableAction = false;
    let contactNumber: string | null = null;

    // 🔥 ASSIGNED → SELLER
    if (order.deliveryStatus === "assigned") {
      console.log("🎯 [STATUS] Order is ASSIGNED - Targeting SELLER location");
      
      target = {
        type: "SELLER",
        lat: order.sellerAddress.latitude,
        lng: order.sellerAddress.longitude,
      };

      console.log("📍 [TARGET] Seller coordinates:", {
        latitude: target.lat,
        longitude: target.lng
      });

      distance = haversineDistance(
        riderLat,
        riderLng,
        target.lat,
        target.lng
      );

      console.log("📏 [DISTANCE] Rider to Seller:", {
        distanceInMeters: distance,
        rounded: distance ? Math.round(distance) : null
      });

      if (distance <= 100) {
        enableAction = true;
        console.log("✅ [ACTION] ENABLED - Rider within 100m of seller (PICKUP READY)");
      } else {
        console.log("⏳ [ACTION] DISABLED - Rider is", distance, "meters away from seller");
      }

      if (distance <= 1000) {
        console.log("📞 [CONTACT] Fetching seller phone number within 1km range");
        const seller = await User.findById(order.sellerId).select("phone");
        contactNumber = seller?.phone || null;
        console.log("📞 [CONTACT] Seller phone:", contactNumber ? "Found" : "Not found");
      } else {
        console.log("📞 [CONTACT] Seller contact not shown - Distance > 1km");
      }
    }

    // 🔥 PICKED_UP → BUYER
    if (order.deliveryStatus === "picked_up") {
      console.log("🎯 [STATUS] Order is PICKED_UP - Targeting BUYER location");
      
      target = {
        type: "BUYER",
        lat: order.buyerAddress.latitude,
        lng: order.buyerAddress.longitude,
      };

      console.log("📍 [TARGET] Buyer coordinates:", {
        latitude: target.lat,
        longitude: target.lng
      });

      distance = haversineDistance(
        riderLat,
        riderLng,
        target.lat,
        target.lng
      );

      console.log("📏 [DISTANCE] Rider to Buyer:", {
        distanceInMeters: distance,
        rounded: distance ? Math.round(distance) : null
      });

      if (distance <= 100) {
        enableAction = true;
        console.log("✅ [ACTION] ENABLED - Rider within 100m of buyer (DELIVERY READY)");
      } else {
        console.log("⏳ [ACTION] DISABLED - Rider is", distance, "meters away from buyer");
      }

      if (distance <= 1000) {
        console.log("📞 [CONTACT] Fetching buyer phone number within 1km range");
        const buyer = await User.findById(order.buyerId).select("phone");
        contactNumber = buyer?.phone || null;
        console.log("📞 [CONTACT] Buyer phone:", contactNumber ? "Found" : "Not found");
      } else {
        console.log("📞 [CONTACT] Buyer contact not shown - Distance > 1km");
      }
    }

    // If status is neither assigned nor picked_up
    if (order.deliveryStatus !== "assigned" && order.deliveryStatus !== "picked_up") {
      console.log("⚠️ [STATUS] Order status is neither 'assigned' nor 'picked_up':", order.deliveryStatus);
      console.log("📞 [CONTACT] No contact number for this status");
    }

    const responseData = {
      success: true,
      orderId: order.orderId,
      deliveryStatus: order.deliveryStatus,
      rider: {
        lat: riderLat,
        lng: riderLng,
        updatedAt: order.riderLocation.updatedAt,
      },
      navigationTarget: target,
      distanceInMeters: distance ? Math.round(distance) : null,
      signals: {
        enableActionButton: enableAction,
        showContactNumber: distance !== null && distance <= 1000,
      },
      contactNumber,
      serverTime: new Date(),
    };

    console.log("📤 [RESPONSE] Sending data to frontend:", {
      orderId: responseData.orderId,
      deliveryStatus: responseData.deliveryStatus,
      distance: responseData.distanceInMeters,
      enableActionButton: responseData.signals.enableActionButton,
      showContactNumber: responseData.signals.showContactNumber,
      hasContactNumber: !!responseData.contactNumber,
      serverTime: responseData.serverTime
    });

    console.log("✅ [API] Request completed successfully");
    
    return res.json(responseData);

  } catch (err: any) {
    console.error("❌ [ERROR] getRiderLiveCoordinates error:", {
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({
      success: false,
      message: err.message || "Server error in getRiderLiveCoordinates",
    });
  }
};