import mongoose from "mongoose";
import Order from "../../../models/tizzyos/shipping/order/order";
import DeliveryTracking from "../../../models/tizzyos/shipping/order/deliveryTracking";
import FWSWareHouse from "../../../models/tizzyos/shipping/fws/fwsWareHouse";
import Shipping from "../../../models/tizzyos/shipping/fws/fwsRegistration";
import ShippingLocation from "../../../models/tizzyos/shipping/fws/fwsRiderLocation";
import User from "../../../models/tizzygo/auths/User";
import {
  generateTrackingId,
  generateDispatchId,
  addTrackingHistory,
  calculateDistance,
} from "../../../utils/tizzyos/shippings/trackingUtils";

export class TrackingService {
  private static async validateSeller(userId: string): Promise<boolean> {
    const user = await User.findById(userId);
    if (!user || user.role !== "SELLER") {
      throw new Error("Unauthorized: User is not a seller");
    }
    return true;
  }

  // FIX 2: Renamed from validateFWS, removed capacity check
  private static async validateFWSUser(userId: string): Promise<any> {
    const fws = await FWSWareHouse.findOne({
      "employees.userId": userId,
      status: "ACTIVE",
      isAcceptingOrders: true,
    });
    if (!fws) {
      throw new Error(
        "Unauthorized: User is not an active FWS employee or FWS is not accepting orders",
      );
    }
    return fws;
  }

  // FIX 2: New method for capacity check (used only when parcel enters FWS)
  private static async checkFWSCapacity(fws: any): Promise<void> {
    if (fws.currentOrders >= fws.maxDailyOrders) {
      throw new Error(
        `FWS has reached maximum daily order capacity (${fws.maxDailyOrders})`,
      );
    }
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
    if (!shipping) {
      throw new Error(
        `Shipping partner is either not approved, offline, or unavailable`,
      );
    }
    if (shipping.orderStats.assigned >= shipping.maxOrdersPerDay) {
      throw new Error(
        `${shipping.shippingType} has reached maximum daily order capacity (${shipping.maxOrdersPerDay})`,
      );
    }
    const shippingLocation = await ShippingLocation.findOne({ userId });
    if (!shippingLocation || !shippingLocation.isTrackingOn) {
      throw new Error(
        `${shipping.shippingType} location tracking is OFF. Please turn on location tracking`,
      );
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

  // API 1: Seller Accepts Order
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
        message:
          "Order accepted successfully. Waiting for shipping partner assignment.",
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // API 2: Seller delivers parcel to FWS
  static async deliverToFWS(
    orderId: string,
    sellerId: string,
    fwsCode: string,
  ) {
    await this.validateSeller(sellerId);
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await Order.findOne({ orderId, sellerId }).session(session);
      if (!order) throw new Error("Order not found or unauthorized");
      if (order.fulfillmentType !== "FWS")
        throw new Error("Order not for FWS fulfillment");

      const tracking = await DeliveryTracking.findOne({ orderId }).session(
        session,
      );
      if (!tracking) throw new Error("Tracking record not found");

      // Prevent duplicate delivery to the same FWS
      if (tracking.currentFWS?.fwsId === fwsCode) {
        throw new Error("Parcel already at this FWS");
      }

      const sellerAccepted =
        tracking.trackingHistory?.some(
          (item: any) =>
            item.holderType === "SELLER" &&
            item.status === "waiting_for_assignment",
        ) || false;
      if (!sellerAccepted) throw new Error("Order not accepted by seller yet");

      const fws = await FWSWareHouse.findOne({
        fwsCode,
        status: "ACTIVE",
        isAcceptingOrders: true,
      }).session(session);
      if (!fws) throw new Error("FWS not found or not accepting orders");
      // FIX 2: Capacity check only on intake
      await this.checkFWSCapacity(fws);

      const dispatchId = generateDispatchId();
      if (!order.shippingLabel) throw new Error("Shipping label not found");
      order.shippingLabel.qrData.dispatchId = dispatchId;

      fws.currentOrders += 1;
      await fws.save({ session });

      // Update route with duplicate check
      const alreadyInRoute = tracking.route.some(
        (r: any) => r.fwsId === fwsCode,
      );
      if (!alreadyInRoute) {
        tracking.route.push({
          fwsId: fwsCode,
          fwsName: fws.name,
          city: fws.city,
        });
      }

      tracking.currentHolderType = "FWS";
      tracking.currentHolderId = fwsCode;
      tracking.currentHolderName = fws.name;
      tracking.currentStatus = "at_fws";
      tracking.currentFWS = {
        fwsId: fwsCode,
        fwsName: fws.name,
        address: fws.address,
        latitude: fws.latitude,
        longitude: fws.longitude,
        updatedAt: new Date(),
      };
      tracking.trackingHistory = addTrackingHistory(tracking.trackingHistory, {
        status: "delivered_to_fws",
        holderType: "FWS",
        holderId: fwsCode,
        holderName: fws.name,
        note: "Seller delivered parcel to FWS",
        toLocation: {
          address: fws.address,
          latitude: fws.latitude,
          longitude: fws.longitude,
        },
      });
      await tracking.save({ session });
      await order.save({ session });
      await session.commitTransaction();
      return {
        orderId,
        dispatchId,
        fwsCode,
        fwsName: fws.name,
        status: "at_fws",
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // API 3: Seller assigns shipping partner (direct fulfillment)
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

      if (
        tracking?.pendingAssignment &&
        tracking.pendingAssignment.status === "PENDING_ACCEPTANCE"
      ) {
        throw new Error(
          "Another assignment is already pending for this order. Please wait or cancel it.",
        );
      }

      let assignedShippingId = shippingId;
      let distance = 0;

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

  // API 4: FWS verifies QR and marks ready for dispatch
  static async verifyQRAndMarkReadyForDispatch(qrData: any, fwsUserId: string) {
    // FIX 2: Use validateFWSUser (no capacity check)
    const fws = await this.validateFWSUser(fwsUserId);
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { orderId, sellerId, buyerId, dispatchId } = qrData;
      const query: any = { orderId, sellerId, buyerId };
      if (dispatchId) query["shippingLabel.qrData.dispatchId"] = dispatchId;

      const order = await Order.findOne(query).session(session);
      if (!order) throw new Error("Invalid QR code or order not found");
      if (order.fulfillmentType !== "FWS")
        throw new Error("Order not for FWS fulfillment");

      const tracking = await DeliveryTracking.findOne({ orderId }).session(
        session,
      );
      if (!tracking) throw new Error("Tracking record not found");

      const alreadyInRoute = tracking.route.some(
        (r: any) => r.fwsId === fws.fwsCode,
      );
      if (!alreadyInRoute) {
        tracking.route.push({
          fwsId: fws.fwsCode,
          fwsName: fws.name,
          city: fws.city,
        });
      }

      tracking.currentStatus = "ready_for_dispatch";
      tracking.currentHolderType = "FWS";
      tracking.currentHolderId = fws.fwsCode;
      tracking.currentHolderName = fws.name;
      tracking.currentFWS = {
        fwsId: fws.fwsCode,
        fwsName: fws.name,
        address: fws.address,
        latitude: fws.latitude,
        longitude: fws.longitude,
        updatedAt: new Date(),
      };
      tracking.trackingHistory = addTrackingHistory(tracking.trackingHistory, {
        status: "verified_at_fws",
        holderType: "FWS",
        holderId: fws.fwsCode,
        holderName: fws.name,
        note: "FWS verified order and marked ready for dispatch",
        toLocation: {
          address: fws.address,
          latitude: fws.latitude,
          longitude: fws.longitude,
        },
      });
      await tracking.save({ session });
      await order.save({ session });
      await session.commitTransaction();

      return {
        success: true,
        order: {
          orderId: order.orderId,
          sellerId: order.sellerId,
          buyerId: order.buyerId,
          items: order.items,
          finalAmount: order.finalAmount,
        },
        sellerDetails: { name: order.sellerName, address: order.sellerAddress },
        buyerDetails: { name: order.buyerName, address: order.buyerAddress },
        fwsDetails: {
          fwsCode: fws.fwsCode,
          name: fws.name,
          address: fws.address,
        },
        readyForDispatch: true,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // API 5: FWS assigns shipping partner
  static async fwsAssignShipping(
    orderId: string,
    fwsUserId: string,
    shippingId: string | undefined,
    assignmentType: "AUTO" | "MANUAL",
    shippingType: string,
  ) {
    // FIX 2: Use validateFWSUser (no capacity check)
    const fws = await this.validateFWSUser(fwsUserId);
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await Order.findOne({ orderId }).session(session);
      if (!order) throw new Error("Order not found");

      const tracking = await DeliveryTracking.findOne({ orderId }).session(
        session,
      );
      if (!tracking || tracking.currentStatus !== "ready_for_dispatch") {
        throw new Error("Order not ready for dispatch");
      }
      if (tracking.currentFWS?.fwsId !== fws.fwsCode) {
        throw new Error("Unauthorized: Order not at this FWS");
      }

      if (
        tracking.pendingAssignment &&
        tracking.pendingAssignment.status === "PENDING_ACCEPTANCE"
      ) {
        throw new Error(
          "Another assignment is already pending for this order. Please wait or cancel it.",
        );
      }

      let assignedShippingId = shippingId;
      let distance = 0;

      if (assignmentType === "AUTO") {
        const result = await this.findNearestAvailableShippingPartner(
          fws.latitude,
          fws.longitude,
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
        assignedBy: fws.fwsCode,
        assignedByType: "FWS" as const,
        assignedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        assignmentType,
        distance: distance || 0,
        status: "PENDING_ACCEPTANCE" as const,
      };

      tracking.pendingAssignment = pendingAssignment;
      tracking.currentAssignment = shippingType as any;
      tracking.currentStatus = "assignment_sent";
      tracking.trackingHistory = addTrackingHistory(tracking.trackingHistory, {
        status: "assignment_sent",
        holderType: "FWS",
        holderId: fws.fwsCode,
        holderName: fws.name,
        note: `${shippingType} assignment sent from FWS (${assignmentType})`,
      });
      await tracking.save({ session });

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

  // API 6: Shipping partner accepts assignment (atomic)
  static async acceptAssignment(
    orderId: string,
    assignmentId: string,
    userId: string,
  ) {
    const { shipping, shippingLocation } =
      await this.validateShippingPartner(userId);
    const shippingType = shipping.shippingType;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await Order.findOne({ orderId }).session(session);
      if (!order) throw new Error("Order not found");

      let trackingId = order.trackingId;
      if (!trackingId) {
        trackingId = generateTrackingId();
        order.trackingId = trackingId;
        await order.save({ session });
      }

      // FIX 1: Use $unset for pendingAssignment, avoid conflict
      const updatedTracking = await DeliveryTracking.findOneAndUpdate(
        {
          orderId,
          "pendingAssignment.assignmentId": assignmentId,
          "pendingAssignment.status": "PENDING_ACCEPTANCE",
          "pendingAssignment.expiresAt": { $gt: new Date() },
          currentStatus: { $nin: ["assigned", "delivered"] },
        },
        {
          $set: {
            currentStatus: "assigned",
            currentHolderType: shippingType,
            currentHolderId: userId,
            currentHolderName: shipping.name,
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
          $unset: { pendingAssignment: "" },
          $push: {
            trackingHistory: {
              status: "assignment_accepted",
              holderType: shippingType,
              holderId: userId,
              holderName: shipping.name,
              note: `${shippingType} accepted assignment and tracking started`,
              fromLocation: {
                address: shippingLocation.location?.address,
                latitude: shippingLocation.location?.latitude,
                longitude: shippingLocation.location?.longitude,
              },
              createdAt: new Date(),
            },
          },
        },
        { session, new: true },
      );

      if (!updatedTracking) {
        throw new Error(
          "Assignment already accepted, expired, or order already assigned/delivered",
        );
      }

      shipping.orderStats.assigned += 1;
      shipping.orderStats.remaining += 1;
      await shipping.save({ session });

      await session.commitTransaction();
      return {
        trackingId,
        orderId,
        tracking: updatedTracking,
        message: "Assignment accepted. Tracking created.",
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // API 7: Update handover status
  static async updateHandover(
    orderId: string,
    fromUserId: string,
    toHolderId: string,
    toHolderType: string,
    notes?: string,
    location?: any,
    newStatus?: "picked_up" | "in_transit" | "out_for_delivery",
  ) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const tracking = await DeliveryTracking.findOne({ orderId }).session(
        session,
      );
      if (!tracking) throw new Error("Tracking not found");
      if (tracking.currentHolderId !== fromUserId) {
        throw new Error("Unauthorized: Only current holder can handover");
      }
      if (fromUserId === toHolderId) {
        throw new Error("Cannot hand over to yourself");
      }

      const allowedTransitions: Record<string, string[]> = {
        SELLER: ["RIDER", "TRUCK", "FWS"],
        FWS: ["RIDER", "TRUCK"],
        RIDER: ["FWS", "BUYER"],
        TRUCK: ["FWS", "BUYER"],
        BUYER: [],
      };
      if (
        !allowedTransitions[tracking.currentHolderType]?.includes(toHolderType)
      ) {
        throw new Error(
          `Invalid handover from ${tracking.currentHolderType} to ${toHolderType}`,
        );
      }

      if (
        tracking.currentHolderType === "FWS" &&
        (toHolderType === "RIDER" || toHolderType === "TRUCK")
      ) {
        const leavingFws = await FWSWareHouse.findOne({
          fwsCode: tracking.currentFWS?.fwsId,
        }).session(session);
        if (leavingFws && leavingFws.currentOrders > 0) {
          leavingFws.currentOrders -= 1;
          await leavingFws.save({ session });
        }
      }

      let toHolderName = "";
      const fromLocation = tracking.currentLocation;

      switch (toHolderType) {
        case "RIDER":
        case "TRUCK": {
          const { shipping, shippingLocation: loc } =
            await this.validateShippingPartner(toHolderId, toHolderType);
          toHolderName = shipping.name;

          tracking.currentShipping = {
            shippingUserId: new mongoose.Types.ObjectId(toHolderId),
            shippingName: shipping.name,
            latitude: loc.location?.latitude,
            longitude: loc.location?.longitude,
            shippingType: toHolderType,
            updatedAt: new Date(),
          };
          if (toHolderType === "RIDER") tracking.totalRidersInvolved += 1;
          else tracking.totalTrucksInvolved += 1;
          break;
        }
        case "FWS": {
          const fws = await FWSWareHouse.findOne({
            fwsCode: toHolderId,
            status: "ACTIVE",
          }).session(session);
          if (!fws) throw new Error("FWS not found or inactive");
          toHolderName = fws.name;
          tracking.currentFWS = {
            fwsId: fws.fwsCode,
            fwsName: fws.name,
            address: fws.address,
            latitude: fws.latitude,
            longitude: fws.longitude,
            updatedAt: new Date(),
          };
          tracking.totalFWSVisited += 1;
          const alreadyInRoute = tracking.route.some(
            (r: any) => r.fwsId === fws.fwsCode,
          );
          if (!alreadyInRoute) {
            tracking.route.push({
              fwsId: fws.fwsCode,
              fwsName: fws.name,
              city: fws.city,
            });
          }
          break;
        }
        case "BUYER": {
          const order = await Order.findOne({ orderId }).session(session);
          toHolderName = order?.buyerName || "Buyer";
          tracking.deliveredAt = new Date();
          tracking.currentStatus = "delivered";

          if (order) {
            order.status = "DELIVERED";
            order.deliveredAt = new Date();
            await order.save({ session });
          }

          if (
            tracking.currentHolderType === "RIDER" ||
            tracking.currentHolderType === "TRUCK"
          ) {
            const finalShipping = await Shipping.findOne({
              userId: fromUserId,
            }).session(session);
            if (finalShipping) {
              finalShipping.orderStats.delivered += 1;
              if (finalShipping.orderStats.remaining > 0) {
                finalShipping.orderStats.remaining -= 1;
              }
              await finalShipping.save({ session });
            }
          }
          break;
        }
        default:
          throw new Error("Invalid holder type");
      }

      tracking.currentHolderType = toHolderType;
      tracking.currentHolderId = toHolderId;
      tracking.currentHolderName = toHolderName;

      if (location) {
        tracking.currentLocation = {
          address: location.address,
          latitude: location.latitude,
          longitude: location.longitude,
          updatedAt: new Date(),
        };
      }

      if (
        newStatus &&
        ["picked_up", "in_transit", "out_for_delivery"].includes(newStatus)
      ) {
        tracking.currentStatus = newStatus;
      } else if (toHolderType === "BUYER") {
        tracking.currentStatus = "delivered";
      } else if (toHolderType === "FWS") {
        tracking.currentStatus = "at_fws";
      } else {
        tracking.currentStatus = "in_transit";
      }

      const historyEvent: any = {
        status: newStatus
          ? newStatus
          : `handover_to_${toHolderType.toLowerCase()}`,
        holderType: toHolderType,
        holderId: toHolderId,
        holderName: toHolderName,
        note:
          notes ||
          (newStatus
            ? `Status updated to ${newStatus}`
            : `Handover to ${toHolderType}`),
        fromLocation: fromLocation,
      };
      if (location) {
        historyEvent.toLocation = {
          address: location.address,
          latitude: location.latitude,
          longitude: location.longitude,
        };
      }
      tracking.trackingHistory = addTrackingHistory(
        tracking.trackingHistory,
        historyEvent,
      );

      await tracking.save({ session });
      await session.commitTransaction();
      return tracking;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Queries (unchanged)
  static async getTrackingByOrderId(orderId: string, userId: string) {
    const order = await Order.findOne({ orderId });
    if (!order) throw new Error("Order not found");
    const tracking = await DeliveryTracking.findOne({ orderId });
    if (!tracking) throw new Error("Tracking not found");

    const isSeller = order.sellerId === userId;
    const isBuyer = order.buyerId === userId;
    let isFWS = false;
    if (tracking.currentFWS?.fwsId) {
      const fws = await FWSWareHouse.findOne({
        fwsCode: tracking.currentFWS.fwsId,
        "employees.userId": userId,
      });
      isFWS = !!fws;
    }
    const isAssigned =
      tracking.currentHolderId === userId ||
      tracking.currentShipping?.shippingUserId?.toString() === userId;

    if (!isSeller && !isBuyer && !isFWS && !isAssigned) {
      throw new Error("Unauthorized to view this tracking");
    }
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

  static async getOrdersByFWS(fwsUserId: string) {
    const fws = await this.validateFWSUser(fwsUserId);
    const trackings = await DeliveryTracking.find({
      "currentFWS.fwsId": fws.fwsCode,
    }).sort({ createdAt: -1 });
    const ordersWithTracking = await Promise.all(
      trackings.map(async (tracking) => ({
        order: await Order.findOne({ orderId: tracking.orderId }),
        tracking,
      })),
    );
    return ordersWithTracking;
  }

  static async getOrdersByShippingPartner(userId: string) {
    const { shipping } = await this.validateShippingPartner(userId);
    const objectId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : null;
    const trackings = await DeliveryTracking.find({
      $or: [
        { currentHolderId: userId },
        ...(objectId ? [{ "currentShipping.shippingUserId": objectId }] : []),
      ],
    }).sort({ createdAt: -1 });

    const ordersWithTracking = await Promise.all(
      trackings.map(async (tracking) => ({
        order: await Order.findOne({ orderId: tracking.orderId }),
        tracking,
      })),
    );

    const assignedCount = ordersWithTracking.filter(
      (ot) => ot.tracking?.currentStatus === "assigned",
    ).length;
    const deliveredCount = ordersWithTracking.filter(
      (ot) => ot.tracking?.currentStatus === "delivered",
    ).length;
    const stats = {
      assigned: assignedCount,
      delivered: deliveredCount,
      remaining: assignedCount - deliveredCount,
    };
    return { orders: ordersWithTracking, stats };
  }
}
