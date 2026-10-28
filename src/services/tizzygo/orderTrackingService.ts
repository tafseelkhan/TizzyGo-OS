// src/services/orderTrackingService.ts

import mongoose from "mongoose";
import DeliveryTracking from "../../models/tizzyos/shipping/order/deliveryTracking";
import Order from "../../models/tizzygo/checkout/order";
import ShippingLocation from "../../models/tizzyos/shipping/fws/fwsRiderLocation";

import { getQutonConnectModels } from "../../config/tizzygo/qutonConnectDatabase";

import SellerApplication from "../../models/tizzyos/seller/SellerApplication";
import {
  ITrackingUpdate,
  ITimelineEvent,
  IAddressInfo,
  IOrderTrackingResponse,
} from "../../types/tizzygo/tracking";

/**
 * Derive a full name from Quton Connect user fields.
 * Returns null when no name components are present.
 */
function getFullName(user: {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
}): string | null {
  const derived = [user.firstName, user.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();

  if (derived) return derived;
  if (user.displayName) return user.displayName;
  return null;
}

export class OrderTrackingService {
  /**
   * Get initial tracking data for an order
   *
   * ✅ SUPPORTS TWO MODES:
   *
   * MODE 1: Tracking DOES NOT exist (pending seller acceptance)
   * - Returns trackingCreated: false
   * - Returns pending timeline with "Waiting for Seller Acceptance"
   * - NO ERROR THROWN
   *
   * MODE 2: Tracking EXISTS
   * - Returns trackingCreated: true
   * - Returns full shipment timeline
   * - Complete tracking data
   */
  async getInitialTrackingData(
    orderId: string,
    userId: string,
  ): Promise<IOrderTrackingResponse> {
    // Get order
    const order = await Order.findOne({
      orderId,
      buyerId: userId,
    }).lean();

    if (!order) {
      throw new Error("Order not found or unauthorized");
    }

    // Quton Connect models
    const { User } = getQutonConnectModels();

    // Get seller info (Quton User)
    // TODO(quton-migration): `sellerEmail` has no source on Quton schema.
    // See TODO on `orderObject.sellerEmail` below.
    const seller = await User.findById(order.sellerId)
      .select("firstName lastName phone")
      .lean();

    const sellerApplication = await SellerApplication.findOne({
      userId: order.sellerId,
      status: "approved",
    }).lean();

    // Get buyer info (Quton User)
    // TODO(quton-migration): `buyerEmail` has no source on Quton schema.
    // See TODO on `orderObject.buyerEmail` below.
    const buyer = await User.findById(userId)
      .select("firstName lastName phone")
      .lean();

    const sellerDerivedName = seller ? getFullName(seller) : null;
    const buyerDerivedName = buyer ? getFullName(buyer) : null;

    // Build order object with all details
    const orderObject = {
      _id: order._id,
      orderId: order.orderId,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      // Name fallback chain: derived → order.sellerName (business field)
      // → literal "Seller".
      sellerName:
        sellerDerivedName || order.sellerName || "Seller",
      // TODO(quton-migration): `sellerEmail` has no field on Quton User.
      // Awaiting decision on contact-email source (business record vs.
      // connectAddress). Currently undefined.
      sellerEmail: undefined as string | undefined,
      sellerPhone: seller?.phone,
      // Name fallback chain: derived → order.buyerName (business field)
      // → literal "Customer".
      buyerName:
        buyerDerivedName || order.buyerName || "Customer",
      // TODO(quton-migration): `buyerEmail` has no field on Quton User.
      // Awaiting decision on contact-email source.
      buyerEmail: undefined as string | undefined,
      buyerPhone: buyer?.phone,
      productTitle: order.productTitle || "Product",
      productImage: order.productImage || "",
      productId: order.productId,
      productBrand: order.productBrand,
      productCategory: order.productCategory,
      variant: order.variant || null,
      quantity: order.quantity || 1,
      price: order.price || 0,
      finalAmount: order.finalAmount || order.totalAmount || 0,
      totalAmount: order.totalAmount || order.finalAmount || 0,
      paymentStatus: order.paymentStatus || "PENDING",
      status: order.status || "PENDING",
      fulfillmentType: order.fulfillmentType || "SELLER",
      cashOnDelivery: order.cashOnDelivery || false,
      shippingAddress: {
        address: order.shippingAddress?.address || "",
        latitude: order.shippingAddress?.latitude || 0,
        longitude: order.shippingAddress?.longitude || 0,
        googlePlaceId: order.shippingAddress?.googlePlaceId || "",
        city: order.shippingAddress?.city || "",
        state: order.shippingAddress?.state || "",
        pincode: order.shippingAddress?.pincode || "",
        country: order.shippingAddress?.country || "India",
      },
      sellerAddress: {
        address:
          order.sellerAddress?.address ||
          sellerApplication?.businessAddress ||
          "",
        latitude:
          order.sellerAddress?.latitude || sellerApplication?.latitude || 0,
        longitude:
          order.sellerAddress?.longitude || sellerApplication?.longitude || 0,
        googlePlaceId: order.sellerAddress?.googlePlaceId || "",
        city: order.sellerAddress?.city || sellerApplication?.city || "",
        state: order.sellerAddress?.state || sellerApplication?.state || "",
        pincode:
          order.sellerAddress?.pincode || sellerApplication?.pincode || "",
        country: order.sellerAddress?.country || "India",
      },
      trackingId: order.trackingId || null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };

    // Get tracking
    const tracking = await DeliveryTracking.findOne({ orderId }).lean();

    // ✅ MODE 1: Tracking DOES NOT exist - Return pending response
    if (!tracking) {
      console.log(
        `📦 [ORDER_TRACKING] No tracking found for order: ${orderId}`,
      );
      console.log(
        `📦 [ORDER_TRACKING] Returning pending seller acceptance state`,
      );

      const buyerAddress: IAddressInfo = {
        address: order.shippingAddress?.address || "",
        latitude: order.shippingAddress?.latitude || 0,
        longitude: order.shippingAddress?.longitude || 0,
        googlePlaceId: order.shippingAddress?.googlePlaceId || "",
      };

      const sellerAddress: IAddressInfo = {
        address:
          order.sellerAddress?.address ||
          sellerApplication?.businessAddress ||
          "",
        latitude:
          order.sellerAddress?.latitude || sellerApplication?.latitude || 0,
        longitude:
          order.sellerAddress?.longitude || sellerApplication?.longitude || 0,
        googlePlaceId: order.sellerAddress?.googlePlaceId || "",
      };

      // ✅ Build pending timeline
      const pendingTimeline = this.buildPendingTimeline();

      return {
        trackingCreated: false,
        currentStatus: "pending_seller_acceptance",
        order: orderObject,
        tracking: null,
        buyerAddress,
        sellerAddress,
        riderLocation: null,
        timeline: pendingTimeline,
        distance: null,
        eta: null,
        estimatedDelivery: null,
        isDelivered: false,
        isCancelled: false,
        trackingAvailable: false,
        message:
          "Seller has not accepted your order yet. Tracking will start once seller accepts.",
      };
    }

    // ✅ MODE 2: Tracking EXISTS - Continue with full tracking
    console.log(`📦 [ORDER_TRACKING] Tracking found for order: ${orderId}`);
    console.log(
      `📦 [ORDER_TRACKING] Current status: ${tracking.currentStatus}`,
    );

    const buyerAddress: IAddressInfo = {
      address: order.shippingAddress?.address || "",
      latitude: order.shippingAddress?.latitude || 0,
      longitude: order.shippingAddress?.longitude || 0,
      googlePlaceId: order.shippingAddress?.googlePlaceId || "",
    };

    const sellerAddress: IAddressInfo = {
      address:
        order.sellerAddress?.address ||
        sellerApplication?.businessAddress ||
        "",
      latitude:
        order.sellerAddress?.latitude || sellerApplication?.latitude || 0,
      longitude:
        order.sellerAddress?.longitude || sellerApplication?.longitude || 0,
      googlePlaceId: order.sellerAddress?.googlePlaceId || "",
    };

    // Get rider location if current holder is RIDER
    let riderLocation = null;
    let riderName = null;
    let riderPhone = null;
    let riderRating = null;

    if (tracking.currentHolderType === "RIDER" && tracking.currentHolderId) {
      // ============================================================
      // TODO(quton-migration): VERIFY which collection
      // `tracking.currentHolderId` refers to when holder type is
      // "RIDER".
      //
      // In riderAssignment.controller.ts, the rider ID stored on
      // orders/tracking is `Register._id` (rider business record),
      // NOT a Quton User _id. If that is the case here too, the
      // current Quton User lookup below would return null (same as
      // it does today with the old default-connection User, because
      // the ObjectIds do not match).
      //
      // Options (please confirm):
      //   (a) Register.findById(tracking.currentHolderId)
      //   (b) Quton User.findById(tracking.currentHolderId) — keep as-is
      //   (c) Use tracking.currentHolderName and only look up phone
      //
      // Until resolved, the current Quton User lookup is preserved
      // (same runtime behavior as today — riderName/riderPhone may
      // be null), with derived name support in case (b) is correct.
      // ============================================================
      const riderUser = await User.findById(tracking.currentHolderId)
        .select("firstName lastName phone")
        .lean();
      if (riderUser) {
        riderName = getFullName(riderUser);
        riderPhone = riderUser.phone || null;
      }

      const riderTracking = await ShippingLocation.findOne({
        shippingId: tracking.currentHolderId,
      }).lean();

      if (riderTracking?.location) {
        riderLocation = {
          latitude: riderTracking.location.latitude,
          longitude: riderTracking.location.longitude,
          address: riderTracking.location.address || "",
          updatedAt: riderTracking.location.updatedAt,
        };
      }
    }

    // Build timeline from tracking history
    const timeline = this.buildTimeline(tracking);

    // Calculate distance and ETA (if rider active)
    let distance = null;
    let eta = null;

    if (riderLocation && buyerAddress) {
      distance = this.calculateDistance(
        riderLocation.latitude,
        riderLocation.longitude,
        buyerAddress.latitude,
        buyerAddress.longitude,
      );
      eta = this.calculateETA(distance);
    }

    // Get current shipping partner info
    let shippingPartner = null;
    if (tracking.currentShipping) {
      // ============================================================
      // TODO(quton-migration): VERIFY whether
      // `tracking.currentShipping.shippingUserId` is a Quton User _id
      // or a shipping-partner business record _id.
      //
      // The response already carries `tracking.currentShipping.
      // shippingName` — if that field is authoritative, the lookup
      // below may be unnecessary. Preserved as-is pending your answer.
      // ============================================================
      const shippingUser = await User.findById(
        tracking.currentShipping.shippingUserId,
      )
        .select("firstName lastName phone")
        .lean();

      const shippingDerivedName = shippingUser
        ? getFullName(shippingUser)
        : null;

      shippingPartner = {
        id: tracking.currentShipping.shippingUserId,
        name:
          shippingDerivedName ||
          tracking.currentShipping.shippingName ||
          null,
        phone: shippingUser?.phone || null,
        type: tracking.currentShipping.shippingType || null,
        location: {
          latitude: tracking.currentShipping.latitude,
          longitude: tracking.currentShipping.longitude,
          updatedAt: tracking.currentShipping.updatedAt,
        },
      };
    }

    // Get FWS info if applicable
    let fwsInfo = null;
    if (tracking.currentFWS) {
      fwsInfo = {
        fwsCode: tracking.currentFWS.fwsCode,
        name: tracking.currentFWS.fwsName,
        city: tracking.currentFWS.city,
        address: tracking.currentFWS.address,
        processingStage: tracking.currentFWS.processingStage,
        updatedAt: tracking.currentFWS.updatedAt,
      };
    }

    // Build complete tracking object
    const trackingObject = {
      trackingId: tracking.trackingId,
      currentStatus: tracking.currentStatus,
      currentHolderType: tracking.currentHolderType,
      currentHolderId: tracking.currentHolderId,
      currentHolderName: tracking.currentHolderName,
      currentLocation: tracking.currentLocation,
      currentFWS: fwsInfo,
      currentShipping: shippingPartner,
      routeHistory: tracking.routeHistory || [],
      assignmentHistory: tracking.assignmentHistory || [],
      qrOwnershipHistory: tracking.qrOwnershipHistory || [],
      trackingHistory: tracking.trackingHistory || [],
      totalFWSVisited: tracking.totalFWSVisited || 0,
      totalRidersInvolved: tracking.totalRidersInvolved || 0,
      totalTrucksInvolved: tracking.totalTrucksInvolved || 0,
      deliveredAt: tracking.deliveredAt || null,
      createdAt: tracking.createdAt,
      updatedAt: tracking.updatedAt,
    };

    return {
      trackingCreated: true,
      currentStatus: tracking.currentStatus,
      order: orderObject,
      tracking: trackingObject,
      buyerAddress,
      sellerAddress,
      riderLocation,
      riderName,
      riderPhone,
      riderRating,
      shippingPartner,
      fwsInfo,
      timeline,
      distance,
      eta,
      estimatedDelivery: tracking.deliveredAt?.toISOString() || null,
      isDelivered: tracking.currentStatus === "delivered",
      isCancelled: tracking.currentStatus === "cancelled",
      trackingAvailable: true,
      message:
        tracking.currentStatus === "delivered"
          ? "Order delivered successfully!"
          : `Order is in ${tracking.currentStatus} status.`,
    };
  }

  /**
   * ✅ Build pending timeline for when seller hasn't accepted
   */
  private buildPendingTimeline(): ITimelineEvent[] {
    return [
      {
        status: "Order Placed",
        displayStatus: "Order Placed",
        holderType: "BUYER",
        holderName: "Customer",
        timestamp: new Date(),
        note: "Your order has been placed successfully.",
        isCompleted: true,
        isCurrent: false,
      },
      {
        status: "Waiting for Seller Acceptance",
        displayStatus: "Waiting for Seller Acceptance",
        holderType: "SELLER",
        holderName: "Seller",
        timestamp: new Date(),
        note: "Seller has not accepted your order yet. Tracking will begin once seller accepts.",
        isCompleted: false,
        isCurrent: true,
      },
    ];
  }

  /**
   * Build timeline from tracking history
   */
  private buildTimeline(tracking: any): ITimelineEvent[] {
    const timeline: ITimelineEvent[] = [];
    const statusMap: { [key: string]: string } = {
      created: "Order Created",
      waiting_for_assignment: "Waiting for Assignment",
      in_transit_to_fws: "In Transit to FWS",
      received_at_fws: "Received at FWS",
      scanned_at_fws: "Scanned at FWS",
      ready_for_dispatch: "Ready for Dispatch",
      assignment_sent: "Assignment Sent",
      assignment_accepted: "Assignment Accepted",
      picked_up: "Picked Up",
      in_transit: "In Transit",
      out_for_delivery: "Out for Delivery",
      delivered: "Delivered",
      cancelled: "Cancelled",
    };

    // ✅ Add Seller Accepted if tracking exists
    timeline.push({
      status: "Seller Accepted",
      displayStatus: "Seller Accepted",
      holderType: "SELLER",
      holderName: tracking.currentHolderName || "Seller",
      timestamp: tracking.createdAt || new Date(),
      note: "Seller has accepted your order.",
      isCompleted: true,
      isCurrent: false,
    });

    // Build from trackingHistory
    if (tracking.trackingHistory && tracking.trackingHistory.length > 0) {
      tracking.trackingHistory.forEach((event: any, index: number) => {
        const isCurrent = index === tracking.trackingHistory.length - 1;
        const isCompleted = event.status === "delivered";

        timeline.push({
          status: event.status || "unknown",
          displayStatus: statusMap[event.status] || event.status || "Unknown",
          holderType: event.holderType || "SELLER",
          holderName: event.holderName || "",
          timestamp: event.createdAt || new Date(),
          note: event.note || "",
          isCurrent,
          isCompleted,
        });
      });
    }

    return timeline;
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Calculate ETA based on distance
   */
  private calculateETA(distanceKm: number): number {
    if (!distanceKm || distanceKm <= 0) return 0;
    const avgSpeed = 30;
    const hours = distanceKm / avgSpeed;
    return Math.round(hours * 60);
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  /**
   * Get current tracking status for socket update
   */
  async getTrackingUpdate(orderId: string): Promise<ITrackingUpdate | null> {
    const tracking = await DeliveryTracking.findOne({ orderId }).lean();

    if (!tracking) return null;

    let riderLocation = null;
    if (tracking.currentHolderType === "RIDER" && tracking.currentHolderId) {
      const riderTracking = await ShippingLocation.findOne({
        shippingId: tracking.currentHolderId,
      }).lean();

      if (riderTracking?.location) {
        riderLocation = {
          latitude: riderTracking.location.latitude,
          longitude: riderTracking.location.longitude,
          address: riderTracking.location.address,
          updatedAt: riderTracking.location.updatedAt,
        };
      }
    }

    const timeline = this.buildTimeline(tracking);

    return {
      orderId: tracking.orderId,
      trackingId: tracking.trackingId || tracking.orderId,
      currentStatus: tracking.currentStatus,
      currentHolderType: tracking.currentHolderType,
      currentHolderId: tracking.currentHolderId,
      currentLocation: tracking.currentLocation,
      destinationLocation: tracking.destinationLocation,
      riderLocation: riderLocation || undefined,
      timeline,
      estimatedDelivery: tracking.deliveredAt?.toISOString(),
    };
  }

  /**
   * Get order details only (without tracking)
   */
  async getOrderDetails(orderId: string, userId: string): Promise<any> {
    const order = await Order.findOne({
      orderId,
      buyerId: userId,
    }).lean();

    if (!order) {
      throw new Error("Order not found or unauthorized");
    }

    return order;
  }
}