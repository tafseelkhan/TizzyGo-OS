// src/modules/tracking/tracking.service.ts

import DeliveryTracking from "../../../models/tizzyos/shipping/order/deliveryTracking";
import FWS from "../../../models/tizzyos/fws/fwsWareHouse";
import SellerLocation from "../../../models/tizzyos/seller/locations/locations";
import ShippingLocation from "../../../models/tizzyos/shipping/fws/fwsRiderLocation";

import { getQutonConnectModels } from "../../../config/tizzygo/qutonConnectDatabase";

import Order from "../../../models/tizzygo/checkout/order";
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

/**
 * Derive a full name from Quton Connect user fields.
 */
function getFullName(
  user:
    | {
        firstName?: string | null;
        lastName?: string | null;
        displayName?: string | null;
      }
    | null
    | undefined,
  fallback: string,
): string {
  if (!user) return fallback;
  const derived = [user.firstName, user.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();
  if (derived) return derived;
  if (user.displayName) return user.displayName;
  return fallback;
}

/**
 * Extract a buyer coordinates object from an Order-like document.
 * `order.buyerAddress` / `order.shippingAddress` are business fields
 * on the Order model (default connection) — not Quton User fields.
 */
function getBuyerCoordsFromOrder(
  orderLike:
    | {
        buyerAddress?: {
          latitude?: number;
          longitude?: number;
          address?: string;
        };
        shippingAddress?: {
          latitude?: number;
          longitude?: number;
          address?: string;
        };
      }
    | null
    | undefined,
): ICoordinates | null {
  if (!orderLike) return null;
  const b = orderLike.buyerAddress;
  const s = orderLike.shippingAddress;
  const src =
    b && typeof b.latitude === "number" && typeof b.longitude === "number"
      ? b
      : s && typeof s.latitude === "number" && typeof s.longitude === "number"
        ? s
        : null;
  if (!src) return null;
  return {
    latitude: Number(src.latitude),
    longitude: Number(src.longitude),
    address: src.address || "",
  };
}

export class TrackingService {
  /**
   * Get current holder location from database - COMPLETE FIXED VERSION
   * Now uses ShippingLocation for RIDER/TRUCK locations
   *
   * ⚠️ (H) BUYER: Quton User has no `address` field, so this method
   * cannot resolve BUYER location from just `holderId`. The BUYER
   * case below throws to force callers to supply the order context
   * via `getBuyerCoordsFromOrder(order)`. `checkProximity` and
   * `getLiveTracking` already do that.
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
        // ✅ Only source for rider/truck location: ShippingLocation.
        // (G) The old `User.currentLocation` fallback was removed
        // because `currentLocation` does not exist on the Quton
        // Connect User schema.
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
        // (H) Quton User has no `address.coordinates`. Buyer delivery
        // coordinates live on `Order.buyerAddress` / `shippingAddress`.
        // Callers must pass the resolved coordinates themselves.
        throw new Error(
          `Buyer location must be provided from the order — ` +
            `Quton Connect User has no address field. Order context required for holderId: ${holderId}.`,
        );
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
        const { User } = getQutonConnectModels();
        const user = await User.findById(holderId)
          .select("firstName lastName displayName")
          .lean();
        return getFullName(user, `${holderType} ${holderId.slice(-6)}`);
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
        // (H) When current holder is BUYER we can't derive from Quton
        // User — fall back to the order's buyer address.
        if (currentHolderType === "BUYER") {
          const fromOrder = getBuyerCoordsFromOrder(order);
          if (!fromOrder) {
            throw new Error("Buyer address not available on order");
          }
          currentLocation = fromOrder;
        } else {
          currentLocation = await this.getHolderLocation(
            currentHolderType,
            currentHolderId,
          );
        }
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
          // (H) BUYER target: use order.buyerAddress / shippingAddress.
          if (targetHolderType === "BUYER") {
            const fromOrder = getBuyerCoordsFromOrder(order);
            if (!fromOrder) {
              throw new Error("Buyer address not available on order");
            }
            targetLocation = fromOrder;
          } else {
            targetLocation = await this.getHolderLocation(
              targetHolderType,
              targetHolderId,
            );
          }
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

      const { User } = getQutonConnectModels();

      if (currentHolderType === "RIDER" || currentHolderType === "TRUCK") {
        // ✅ Only source for rider/truck location: ShippingLocation.
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
          // (G) The `User.currentLocation` fallback was removed — the
          // Quton Connect User schema has no such field.
          const location = tracking.currentLocation;
          if (location && location.latitude && location.longitude) {
            latitude = location.latitude;
            longitude = location.longitude;
            address = location.address;
          }
        }

        const user = await User.findById(currentHolderId)
          .select("firstName lastName displayName")
          .lean();
        currentHolderName = getFullName(
          user,
          `${currentHolderType} ${currentHolderId.slice(-6)}`,
        );
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
        const user = await User.findById(currentHolderId)
          .select("firstName lastName displayName")
          .lean();
        currentHolderName = getFullName(
          user,
          `Seller ${currentHolderId.slice(-6)}`,
        );
      } else if (currentHolderType === "BUYER") {
        // (H) Buyer location from the Order business record.
        const fromOrder = getBuyerCoordsFromOrder(order);
        if (fromOrder) {
          latitude = fromOrder.latitude;
          longitude = fromOrder.longitude;
          address = fromOrder.address || undefined;
        } else if (
          tracking.currentLocation &&
          tracking.currentLocation.latitude &&
          tracking.currentLocation.longitude
        ) {
          latitude = tracking.currentLocation.latitude;
          longitude = tracking.currentLocation.longitude;
          address = tracking.currentLocation.address;
        }

        const user = await User.findById(currentHolderId)
          .select("firstName lastName displayName")
          .lean();
        currentHolderName = getFullName(user, "Buyer");
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