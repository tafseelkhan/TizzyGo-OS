// src/modules/tracking/tracking.service.ts

import DeliveryTracking from "../../../models/tizzyos/shipping/order/deliveryTracking";
import FWS from "../../../models/tizzyos/fws/fwsWareHouse";
import SellerLocation from "../../../models/tizzyos/seller/locations/locations";
import ShippingLocation from "../../../models/tizzyos/shipping/fws/fwsRiderLocation";
import User from "../../../models/tizzygo/auths/User";
import Order from "../../../models/tizzyos/shipping/order/order";
import { calculateDistance } from "../../../utils/tizzyos/shippings/trackingUtils";
import {
  IProximityCheckResponse,
  ILiveTrackingResponse,
  HolderType,
  ICoordinates,
} from "../../../types/tizzyos/trackingTypes";

interface IDeliveryTrackingDocument {
  orderId: string;
  currentHolderType: HolderType;
  currentHolderId: string;
  currentLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
    updatedAt?: Date;
  };
  currentShipping?: {
    shippingUserId: any;
    shippingName: string;
    shippingType: string;
  };
  pendingAssignment?: {
    assigneeId: string;
  };
  currentStatus?: string;
  createdAt?: Date;
  [key: string]: any;
}

interface IOrder {
  orderId: string;
  fulfillmentType?: string;
  userId: string;
  assignedFwsId?: string;
  facilityId?: string;
  [key: string]: any;
}

const MAX_HANDOVER_DISTANCE_METERS = 2000;

export class TrackingService {
  /**
   * Get current holder location from database - COMPLETE FIXED VERSION
   * Now uses ShippingLocation for RIDER/TRUCK locations
   */
  private async getHolderLocation(
    holderType: HolderType,
    holderId: string,
  ): Promise<ICoordinates> {
    switch (holderType) {
      case "SELLER": {
        const sellerLocation = await SellerLocation.findOne({
          userId: holderId,
        });
        if (!sellerLocation?.location?.coordinates) {
          throw new Error(`SELLER location not found for ID: ${holderId}`);
        }
        const coordinates = sellerLocation.location.coordinates;
        return {
          latitude: coordinates[1],
          longitude: coordinates[0],
          address: sellerLocation.location.address,
        };
      }

      case "RIDER":
      case "TRUCK": {
        // ✅ FIRST: Try to get location from ShippingLocation model
        const shippingLocation = await ShippingLocation.findOne({
          userId: holderId,
          isTrackingOn: true,
          "location.latitude": { $exists: true, $ne: null },
          "location.longitude": { $exists: true, $ne: null },
        });

        if (
          shippingLocation?.location?.latitude &&
          shippingLocation?.location?.longitude
        ) {
          return {
            latitude: shippingLocation.location.latitude,
            longitude: shippingLocation.location.longitude,
            address: shippingLocation.location.address || "",
          };
        }

        // ✅ SECOND: Fallback to User.currentLocation
        const user = await User.findById(holderId).select(
          "currentLocation.latitude currentLocation.longitude currentLocation.address",
        );

        if (
          user?.currentLocation?.latitude &&
          user?.currentLocation?.longitude
        ) {
          return {
            latitude: user.currentLocation.latitude,
            longitude: user.currentLocation.longitude,
            address: user.currentLocation.address || "",
          };
        }

        throw new Error(
          `${holderType} location not found for ID: ${holderId}. Please enable location tracking.`,
        );
      }

      case "FWS": {
        const fws = await FWS.findById(holderId).select(
          "location.coordinates location.address",
        );
        if (!fws?.location?.coordinates) {
          throw new Error(`FWS location not found for ID: ${holderId}`);
        }
        return {
          latitude: fws.location.coordinates[1],
          longitude: fws.location.coordinates[0],
          address: fws.location.address || "",
        };
      }

      case "BUYER": {
        const user = await User.findById(holderId).select(
          "address.coordinates address.address",
        );
        if (!user?.address?.coordinates) {
          throw new Error(`Buyer address not found for ID: ${holderId}`);
        }
        return {
          latitude: user.address.coordinates.lat,
          longitude: user.address.coordinates.lng,
          address: user.address.address || "",
        };
      }

      default:
        throw new Error(`Unknown holder type: ${holderType}`);
    }
  }

  /**
   * Get holder name for display
   */
  private async getHolderName(
    holderType: HolderType,
    holderId: string,
  ): Promise<string> {
    switch (holderType) {
      case "SELLER":
      case "RIDER":
      case "TRUCK":
      case "BUYER": {
        const user = await User.findById(holderId).select("name");
        return user?.name || `${holderType} ${holderId.slice(-6)}`;
      }

      case "FWS": {
        const fws = await FWS.findById(holderId).select("name");
        return fws?.name || `FWS ${holderId.slice(-6)}`;
      }

      default:
        return holderType;
    }
  }

  /**
   * Determine next handover target based on current holder
   */
  private determineNextTarget(
    currentHolderType: HolderType,
    order: IOrder,
  ): HolderType {
    const fulfillmentType = order.fulfillmentType || "SELLER";

    switch (currentHolderType) {
      case "SELLER":
        return fulfillmentType === "FWS" ? "FWS" : "RIDER";
      case "RIDER":
      case "TRUCK":
        if (fulfillmentType === "FWS") {
          return "FWS";
        }
        return "BUYER";
      case "FWS":
        return "RIDER";
      default:
        throw new Error(
          `Cannot determine next target for: ${currentHolderType}`,
        );
    }
  }

  /**
   * Get assigned shipper ID for order
   */
  private async getAssignedShipperId(orderId: string): Promise<string | null> {
    const tracking = await DeliveryTracking.findOne({ orderId });
    if (!tracking) return null;

    if (tracking.currentShipping?.shippingUserId) {
      return tracking.currentShipping.shippingUserId.toString();
    }
    if (
      tracking.currentHolderType === "RIDER" ||
      tracking.currentHolderType === "TRUCK"
    ) {
      return tracking.currentHolderId;
    }
    if (tracking.pendingAssignment?.assigneeId) {
      return tracking.pendingAssignment.assigneeId;
    }
    return null;
  }

  /**
   * API 1: Check proximity for handover
   */
  async checkProximity(orderId: string): Promise<IProximityCheckResponse> {
    try {
      const tracking = await DeliveryTracking.findOne({ orderId });
      if (!tracking) {
        throw new Error(`Delivery tracking not found for order: ${orderId}`);
      }

      const order = await Order.findOne({ orderId });
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      const currentHolderType: HolderType = tracking.currentHolderType;
      const currentHolderId: string = tracking.currentHolderId;

      let targetHolderType: HolderType = this.determineNextTarget(
        currentHolderType,
        order,
      );
      let targetHolderId: string = "";

      // Get target holder ID based on type
      switch (targetHolderType) {
        case "RIDER":
        case "TRUCK":
          targetHolderId = (await this.getAssignedShipperId(orderId)) || "";
          if (!targetHolderId) {
            return {
              success: false,
              withinRange: false,
              distanceMeters: 0,
              maxDistanceMeters: MAX_HANDOVER_DISTANCE_METERS,
              currentHolderType,
              currentHolderId,
              targetHolderType,
              targetHolderId: "",
              currentLocation: await this.getHolderLocation(
                currentHolderType,
                currentHolderId,
              ).catch(() => ({ latitude: 0, longitude: 0, address: "" })),
              targetLocation: { latitude: 0, longitude: 0, address: "" },
              message: `No ${targetHolderType} assigned to this order yet. Please wait for assignment.`,
            };
          }
          break;

        case "FWS":
          targetHolderId = order.assignedFwsId ?? order.facilityId ?? "";
          if (!targetHolderId) {
            throw new Error("No FWS assigned to this order");
          }
          break;

        case "BUYER":
          targetHolderId = order.userId || "";
          if (!targetHolderId) {
            throw new Error("Buyer ID not found");
          }
          break;

        default:
          throw new Error(`Unknown target type: ${targetHolderType}`);
      }

      // Get current location with error handling
      let currentLocation: ICoordinates = {
        latitude: 0,
        longitude: 0,
        address: "",
      };
      try {
        currentLocation = await this.getHolderLocation(
          currentHolderType,
          currentHolderId,
        );
      } catch (err: any) {
        console.error(`Failed to get current location: ${err.message}`);
        return {
          success: false,
          withinRange: false,
          distanceMeters: 0,
          maxDistanceMeters: MAX_HANDOVER_DISTANCE_METERS,
          currentHolderType,
          currentHolderId,
          targetHolderType,
          targetHolderId,
          currentLocation,
          targetLocation: { latitude: 0, longitude: 0, address: "" },
          message: `Unable to get ${currentHolderType} location: ${err.message}`,
        };
      }

      // Get target location with error handling
      let targetLocation: ICoordinates = {
        latitude: 0,
        longitude: 0,
        address: "",
      };
      if (targetHolderId) {
        try {
          targetLocation = await this.getHolderLocation(
            targetHolderType,
            targetHolderId,
          );
        } catch (err: any) {
          console.error(`Failed to get target location: ${err.message}`);
          return {
            success: false,
            withinRange: false,
            distanceMeters: 0,
            maxDistanceMeters: MAX_HANDOVER_DISTANCE_METERS,
            currentHolderType,
            currentHolderId,
            targetHolderType,
            targetHolderId,
            currentLocation,
            targetLocation,
            message: `Unable to get ${targetHolderType} location: ${err.message}`,
          };
        }
      }

      // Calculate distance
      const distanceMeters = calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        targetLocation.latitude,
        targetLocation.longitude,
      );
      const withinRange = distanceMeters <= MAX_HANDOVER_DISTANCE_METERS;

      return {
        success: true,
        withinRange,
        distanceMeters,
        maxDistanceMeters: MAX_HANDOVER_DISTANCE_METERS,
        currentHolderType,
        currentHolderId,
        targetHolderType,
        targetHolderId,
        currentLocation,
        targetLocation,
        message: !targetHolderId
          ? `No ${targetHolderType} assigned yet`
          : withinRange
            ? "Handover allowed - within range"
            : `Handover not allowed - distance ${distanceMeters.toFixed(0)}m exceeds limit ${MAX_HANDOVER_DISTANCE_METERS}m`,
      };
    } catch (error: any) {
      console.error("Proximity check error:", error);
      throw new Error(error.message || "Failed to check proximity");
    }
  }

  /**
   * API 2: Get live tracking info for buyer
   */
  async getLiveTracking(orderId: string): Promise<ILiveTrackingResponse> {
    try {
      const tracking = await DeliveryTracking.findOne({ orderId });
      if (!tracking) {
        throw new Error(`Delivery tracking not found for order: ${orderId}`);
      }

      const order = await Order.findOne({ orderId });
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      const currentHolderType: HolderType = tracking.currentHolderType;
      const currentHolderId: string = tracking.currentHolderId;

      let latitude: number = 0;
      let longitude: number = 0;
      let address: string | undefined;
      let currentHolderName: string = "";

      if (currentHolderType === "RIDER" || currentHolderType === "TRUCK") {
        // ✅ FIRST: Try ShippingLocation
        const shippingLocation = await ShippingLocation.findOne({
          userId: currentHolderId,
          isTrackingOn: true,
          "location.latitude": { $exists: true, $ne: null },
          "location.longitude": { $exists: true, $ne: null },
        });

        if (
          shippingLocation?.location?.latitude &&
          shippingLocation?.location?.longitude
        ) {
          latitude = shippingLocation.location.latitude;
          longitude = shippingLocation.location.longitude;
          address = shippingLocation.location.address;
        } else {
          // ✅ SECOND: Fallback to tracking.currentLocation
          const location = tracking.currentLocation;
          if (location && location.latitude && location.longitude) {
            latitude = location.latitude;
            longitude = location.longitude;
            address = location.address;
          } else {
            // ✅ THIRD: Fallback to User.currentLocation
            const user = await User.findById(currentHolderId).select(
              "currentLocation.latitude currentLocation.longitude currentLocation.address name",
            );
            latitude = user?.currentLocation?.latitude || 0;
            longitude = user?.currentLocation?.longitude || 0;
            address = user?.currentLocation?.address;
            currentHolderName =
              user?.name || `${currentHolderType} ${currentHolderId.slice(-6)}`;
          }
        }

        if (!currentHolderName) {
          const user = await User.findById(currentHolderId).select("name");
          currentHolderName =
            user?.name || `${currentHolderType} ${currentHolderId.slice(-6)}`;
        }
      } else if (currentHolderType === "FWS") {
        const fws = await FWS.findById(currentHolderId).select(
          "location.coordinates location.address name",
        );
        if (fws?.location?.coordinates) {
          latitude = fws.location.coordinates[1];
          longitude = fws.location.coordinates[0];
          address = fws.location.address;
          currentHolderName = fws.name || `FWS ${currentHolderId.slice(-6)}`;
        } else {
          throw new Error("FWS location not available");
        }
      } else if (currentHolderType === "SELLER") {
        const sellerLocation = await SellerLocation.findOne({
          userId: currentHolderId,
        });
        if (sellerLocation?.location?.coordinates) {
          const coords = sellerLocation.location.coordinates;
          latitude = coords[1];
          longitude = coords[0];
          address = sellerLocation.location.address;
        }
        const user = await User.findById(currentHolderId).select("name");
        currentHolderName = user?.name || `Seller ${currentHolderId.slice(-6)}`;
      } else if (currentHolderType === "BUYER") {
        const user = await User.findById(currentHolderId).select(
          "address.coordinates address.address name",
        );
        latitude = user?.address?.coordinates?.lat || 0;
        longitude = user?.address?.coordinates?.lng || 0;
        address = user?.address?.address;
        currentHolderName = user?.name || "Buyer";
      } else {
        throw new Error(`Unknown holder type: ${currentHolderType}`);
      }

      if (!currentHolderName) {
        currentHolderName = await this.getHolderName(
          currentHolderType,
          currentHolderId,
        );
      }

      let currentStatus = "In Transit";
      if (tracking.currentStatus === "delivered") {
        currentStatus = "Delivered";
      } else if (currentHolderType === "SELLER") {
        currentStatus = "Order Confirmed";
      } else if (currentHolderType === "FWS") {
        currentStatus = "At Fulfillment Center";
      } else if (currentHolderType === "BUYER") {
        currentStatus = "Delivered";
      }

      return {
        success: true,
        data: {
          orderId,
          currentStatus,
          currentHolderType,
          currentHolderName,
          latitude,
          longitude,
          address,
          updatedAt: tracking.currentLocation?.updatedAt || new Date(),
          estimatedDelivery: this.calculateEstimatedDelivery(tracking),
        },
      };
    } catch (error: any) {
      console.error("Live tracking error:", error);
      throw new Error(error.message || "Failed to fetch live tracking");
    }
  }

  private calculateEstimatedDelivery(
    tracking: IDeliveryTrackingDocument,
  ): Date | undefined {
    if (tracking.createdAt) {
      const estimated = new Date(tracking.createdAt);
      estimated.setDate(estimated.getDate() + 2);
      return estimated;
    }
    return undefined;
  }
}
