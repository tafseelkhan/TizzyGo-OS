// services/tizzyos/PayOutPortal/DeliveryChargeEarningService.ts

import mongoose from "mongoose";

import DeliveryChargeEarningModel, {
  DeliveryPartnerType,
} from "../../../models/tizzyos/PayOutPortal/deliveryChargeEarnings";

// ============================================================
// TYPES
// ============================================================

interface DeliveryPartnerEntry {
  deliveryPartnerId: mongoose.Types.ObjectId;
  partnerType: DeliveryPartnerType;
  assignmentId: string;
}

interface FinalizeDeliveryEarningsParams {
  order: any;
  tracking: any;
  session?: mongoose.ClientSession;
}

// ============================================================
// HELPERS
// ============================================================

const getCapturedAt = (order: any): Date => {
  const value =
    order.paidAt || order.updatedAt || order.createdAt || new Date();

  return value instanceof Date ? value : new Date(value);
};

const getSettlementTimes = (capturedAt: Date) => {
  // 24 hours HOLDING
  const holdUntil = new Date(capturedAt.getTime() + 24 * 60 * 60 * 1000);

  // After 24 hours payout becomes available
  const payoutAvailableAt = holdUntil;

  // After another 48 hours wallet becomes available
  const walletAvailableAt = new Date(
    payoutAvailableAt.getTime() + 48 * 60 * 60 * 1000,
  );

  return {
    holdUntil,
    payoutAvailableAt,
    walletAvailableAt,
  };
};

const generateRandomPayoutPart = (length = 20): string => {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  let result = "";

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return result;
};

// TizzyGo internal payout/earning ID
//
// Example:
// dcpp_aB3kL9mZpQxY7TnRw2K
//
const generateDeliveryPayoutId = (): string => {
  return `dcpp_${generateRandomPayoutPart(20)}`;
};

const getDeliveryPartnerType = (
  assigneeType: string,
): DeliveryPartnerType | null => {
  const normalized = String(assigneeType || "").toUpperCase();

  if (normalized === "RIDER") {
    return "RIDER";
  }

  if (normalized === "TRUCK" || normalized === "TRUCKER") {
    return "TRUCKER";
  }

  return null;
};

const toObjectId = (value: any): mongoose.Types.ObjectId | null => {
  if (!value) return null;

  const stringValue = value.toString();

  if (!mongoose.Types.ObjectId.isValid(stringValue)) {
    return null;
  }

  return new mongoose.Types.ObjectId(stringValue);
};

// ============================================================
// SERVICE
// ============================================================

export class DeliveryChargeEarningService {
  // ==========================================================
  // GET UNIQUE ACCEPTED RIDER / TRUCKER PARTNERS
  // ==========================================================

  static getAcceptedDeliveryPartners(tracking: any): DeliveryPartnerEntry[] {
    const assignmentHistory = tracking?.assignmentHistory || [];

    if (!Array.isArray(assignmentHistory)) {
      return [];
    }

    const partners = new Map<string, DeliveryPartnerEntry>();

    for (const assignment of assignmentHistory) {
      // ------------------------------------------------------
      // Only ACCEPTED assignments become earning candidates.
      // ------------------------------------------------------

      if (String(assignment?.status || "").toUpperCase() !== "ACCEPTED") {
        continue;
      }

      const partnerType = getDeliveryPartnerType(assignment?.assigneeType);

      if (!partnerType) {
        continue;
      }

      const partnerId = toObjectId(assignment?.assigneeId);

      if (!partnerId) {
        continue;
      }

      const partnerKey = `${partnerType}:${partnerId.toString()}`;

      // ------------------------------------------------------
      // Same partner may appear multiple times in tracking.
      // One order = one earning record per partner.
      // ------------------------------------------------------

      if (partners.has(partnerKey)) {
        continue;
      }

      partners.set(partnerKey, {
        deliveryPartnerId: partnerId,
        partnerType,
        assignmentId: String(assignment.assignmentId || ""),
      });
    }

    return Array.from(partners.values());
  }

  // ==========================================================
  // CALCULATE DELIVERY CHARGE
  // ==========================================================

  static calculateDeliveryCharge(order: any): number {
    const deliveryCharge = Number(order?.deliveryCharge || 0);

    return Math.max(0, Number(deliveryCharge.toFixed(2)));
  }

  // ==========================================================
  // SPLIT DELIVERY CHARGE
  //
  // CURRENT RULE:
  // Equal split between unique accepted Rider/Trucker
  //
  // Example:
  //
  // Delivery Charge = ₹200
  // Partners = 3
  //
  // 200 / 3
  // = ₹66.67
  // = ₹66.67
  // = ₹66.66
  //
  // Total remains exactly ₹200.
  // ==========================================================

  static splitDeliveryCharge(
    deliveryCharge: number,
    partnerCount: number,
  ): number[] {
    if (deliveryCharge <= 0 || partnerCount <= 0) {
      return [];
    }

    const totalPaise = Math.round(deliveryCharge * 100);

    const basePaise = Math.floor(totalPaise / partnerCount);

    const remainderPaise = totalPaise % partnerCount;

    const amounts: number[] = [];

    for (let i = 0; i < partnerCount; i++) {
      const amountPaise = basePaise + (i < remainderPaise ? 1 : 0);

      amounts.push(Number((amountPaise / 100).toFixed(2)));
    }

    return amounts;
  }

  // ==========================================================
  // FINALIZE DELIVERY EARNINGS
  //
  // THIS METHOD SHOULD ONLY RUN WHEN THE ORDER IS DELIVERED.
  //
  // It:
  //
  // 1. Gets accepted Rider/Trucker from tracking
  // 2. Gets deliveryCharge from Order
  // 3. Splits deliveryCharge
  // 4. Creates one earning per partner
  // 5. Uses dcpp_... payoutId
  // 6. Starts earning at HOLDING
  //
  // IMPORTANT:
  // Same MongoDB session can be passed from TrackingService.
  // ==========================================================

  static async finalizeDeliveryEarnings(
    params: FinalizeDeliveryEarningsParams,
  ) {
    const { order, tracking, session } = params;

    // ========================================================
    // VALIDATION
    // ========================================================

    if (!order) {
      throw new Error("Delivery earning: Order is required");
    }

    if (!tracking) {
      throw new Error("Delivery earning: Tracking is required");
    }

    if (String(tracking.currentStatus || "").toLowerCase() !== "delivered") {
      throw new Error(
        "Delivery earning can only be finalized for a delivered order",
      );
    }

    // ========================================================
    // DELIVERY CHARGE
    // ========================================================

    const deliveryCharge = this.calculateDeliveryCharge(order);

    if (deliveryCharge <= 0) {
      console.log("💰 DELIVERY EARNING: Delivery charge is ₹0. Skipping.");

      return {
        success: true,
        created: 0,
        skipped: true,
        reason: "DELIVERY_CHARGE_ZERO",
        earnings: [],
      };
    }

    // ========================================================
    // GET ACCEPTED RIDER / TRUCKER
    // ========================================================

    const partners = this.getAcceptedDeliveryPartners(tracking);

    if (partners.length === 0) {
      console.log("💰 DELIVERY EARNING: No accepted Rider/Trucker found.");

      return {
        success: true,
        created: 0,
        skipped: true,
        reason: "NO_ACCEPTED_DELIVERY_PARTNER",
        earnings: [],
      };
    }

    // ========================================================
    // SPLIT DELIVERY CHARGE
    // ========================================================

    const earningAmounts = this.splitDeliveryCharge(
      deliveryCharge,
      partners.length,
    );

    const capturedAt = getCapturedAt(order);

    const { holdUntil, payoutAvailableAt, walletAvailableAt } =
      getSettlementTimes(capturedAt);

    const grossAmount = Number(order.finalAmount || 0);

    const createdEarnings: any[] = [];

    // ========================================================
    // CREATE ONE EARNING PER PARTNER
    // ========================================================

    for (let index = 0; index < partners.length; index++) {
      const partner = partners[index];

      const deliveryEarning = earningAmounts[index];

      if (deliveryEarning <= 0) {
        continue;
      }

      // ------------------------------------------------------
      // DUPLICATE PROTECTION
      // ------------------------------------------------------

      const existingQuery: any = {
        orderId: order._id,
        deliveryPartnerId: partner.deliveryPartnerId,
      };

      const existing = session
        ? await DeliveryChargeEarningModel.findOne(existingQuery).session(
            session,
          )
        : await DeliveryChargeEarningModel.findOne(existingQuery);

      if (existing) {
        console.log(
          `⚠️ DELIVERY EARNING ALREADY EXISTS: ${partner.deliveryPartnerId}`,
        );

        createdEarnings.push(existing);

        continue;
      }

      // ------------------------------------------------------
      // TIZZYGO PAYOUT ID
      // ------------------------------------------------------

      const payoutId = generateDeliveryPayoutId();

      // ------------------------------------------------------
      // CREATE EARNING
      // ------------------------------------------------------

      const earningData = {
        deliveryPartnerId: partner.deliveryPartnerId,

        partnerType: partner.partnerType,

        payoutId,

        orderId: order._id,

        transactionId: order.transactionId,

        orderNumber: order.orderId,

        grossAmount,

        deliveryCharge,

        deliveryEarning,

        status: "HOLDING" as const,

        capturedAt,

        holdUntil,

        payoutAvailableAt,

        walletAvailableAt,
      };

      let earning;

      if (session) {
        const created = await DeliveryChargeEarningModel.create([earningData], {
          session,
        });

        earning = created[0];
      } else {
        earning = await DeliveryChargeEarningModel.create(earningData);
      }

      createdEarnings.push(earning);

      console.log("💰 DELIVERY EARNING CREATED");
      console.log("   Partner:", partner.deliveryPartnerId.toString());
      console.log("   Type:", partner.partnerType);
      console.log("   Order:", order.orderId);
      console.log("   Delivery Charge:", deliveryCharge);
      console.log("   Partner Earning:", deliveryEarning);
      console.log("   payoutId:", payoutId);
      console.log("   Status: HOLDING");
    }

    // ========================================================
    // RESPONSE
    // ========================================================

    return {
      success: true,
      created: createdEarnings.length,
      skipped: false,

      orderId: order.orderId,

      deliveryCharge,

      partnerCount: partners.length,

      totalPartnerEarning: Number(
        createdEarnings
          .reduce(
            (total: number, earning: any) =>
              total + Number(earning.deliveryEarning || 0),
            0,
          )
          .toFixed(2),
      ),

      earnings: createdEarnings.map((earning: any) => ({
        earningId: earning._id,

        payoutId: earning.payoutId,

        deliveryPartnerId: earning.deliveryPartnerId,

        partnerType: earning.partnerType,

        deliveryEarning: earning.deliveryEarning,

        status: earning.status,
      })),
    };
  }
}

export default DeliveryChargeEarningService;
