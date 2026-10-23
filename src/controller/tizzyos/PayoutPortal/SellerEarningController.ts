// controllers/PayOutPortal/EarningController.ts

import { Request, Response } from "express";
import mongoose from "mongoose";

import Order from "../../../models/tizzygo/checkout/order";

import SellerEarningModel from "../../../models/tizzyos/PayOutPortal/sellerEarnings";

import CompanyEarningModel from "../../../models/tizzyos/PayOutPortal/companyEarnings";

// ============================================================
// HELPERS
// ============================================================

const getCapturedAt = (order: any): Date => {
  const value =
    order.paidAt ||
    order.updatedAt ||
    order.createdAt ||
    new Date();

  return value instanceof Date ? value : new Date(value);
};

const getSettlementTimes = (capturedAt: Date) => {
  /**
   * CAPTURED
   *    ↓ 24 hours
   * PAYOUT_AVAILABLE
   *    ↓ 48 hours
   * WALLET_AVAILABLE
   */

  const holdUntil = new Date(
    capturedAt.getTime() + 24 * 60 * 60 * 1000,
  );

  const payoutAvailableAt = holdUntil;

  const walletAvailableAt = new Date(
    payoutAvailableAt.getTime() + 48 * 60 * 60 * 1000,
  );

  return {
    holdUntil,
    payoutAvailableAt,
    walletAvailableAt,
  };
};

const isCapturedOrder = (order: any): boolean => {
  return (
    order.status === "captured" ||
    order.paymentStatus === "captured"
  );
};

// ============================================================
// UNIQUE PAYOUT ID
// ============================================================

const generateRandomPayoutPart = (
  length = 20,
): string => {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  let result = "";

  for (let i = 0; i < length; i++) {
    result += characters.charAt(
      Math.floor(Math.random() * characters.length),
    );
  }

  return result;
};

const generatePayoutId = (
  type: "spp" | "cpp",
): string => {
  return `${type}_${generateRandomPayoutPart(20)}`;
};

// ============================================================
// AMOUNT CALCULATIONS
// ============================================================

/**
 * Seller gets:
 *
 * finalAmount
 * - product GST
 * - platform fee
 *
 * Delivery charge is NOT deducted from seller earning.
 */
export const calculateSellerEarning = (
  order: any,
): number => {
  const finalAmount = Number(
    order.finalAmount || 0,
  );

  const productGst = Number(
    order.productGst || 0,
  );

  const platformFee = Number(
    order.platformFee || 0,
  );

  return Math.max(
    0,
    Number(
      (
        finalAmount -
        productGst -
        platformFee
      ).toFixed(2),
    ),
  );
};

/**
 * Company earning:
 *
 * platformFee + productGst
 *
 * Delivery charge is NOT included.
 */
export const calculateCompanyEarning = (
  order: any,
): number => {
  const platformFee = Number(
    order.platformFee || 0,
  );

  const productGst = Number(
    order.productGst || 0,
  );

  return Math.max(
    0,
    Number(
      (
        platformFee +
        productGst
      ).toFixed(2),
    ),
  );
};

// ============================================================
// SELLER
// ============================================================

export const createSellerEarning = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId is required",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(
        orderId,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid orderId",
      });
    }

    const order = await Order.findById(
      orderId,
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!isCapturedOrder(order)) {
      return res.status(400).json({
        success: false,
        message:
          "Seller earning can only be created for a captured payment",
      });
    }

    if (!order.sellerId) {
      return res.status(400).json({
        success: false,
        message:
          "Order does not have a sellerId",
      });
    }

    const existingEarning =
      await SellerEarningModel.findOne({
        orderId: order._id,
      });

    if (existingEarning) {
      return res.status(200).json({
        success: true,
        message:
          "Seller earning already exists",
        data: existingEarning,
      });
    }

    const capturedAt =
      getCapturedAt(order);

    const {
      holdUntil,
      payoutAvailableAt,
      walletAvailableAt,
    } = getSettlementTimes(
      capturedAt,
    );

    const grossAmount = Number(
      Number(
        order.finalAmount || 0,
      ).toFixed(2),
    );

    const sellerEarning =
      calculateSellerEarning(order);

    const payoutId =
      generatePayoutId("spp");

    const earning =
      await SellerEarningModel.create({
        sellerId:
          order.sellerId,

        payoutId,

        orderId:
          order._id,

        transactionId:
          order.transactionId,

        orderNumber:
          order.orderId,

        grossAmount,

        sellerEarning,

        status:
          "HOLDING",

        capturedAt,

        holdUntil,

        payoutAvailableAt,

        walletAvailableAt,
      });

    return res.status(201).json({
      success: true,
      message:
        "Seller earning created successfully",
      data: earning,
    });
  } catch (error: any) {
    console.error(
      "[SELLER EARNING CREATE ERROR]",
      error,
    );

    if (error?.code === 11000) {
      const existingEarning =
        await SellerEarningModel.findOne({
          orderId:
            req.body.orderId,
        });

      return res.status(200).json({
        success: true,
        message:
          "Seller earning already exists",
        data: existingEarning,
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Failed to create seller earning",
    });
  }
};

// ============================================================
// SELLER GET
// ============================================================

export const getSellerEarnings = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { status } =
      req.query;

    const userId =
      (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Authenticated userId is required",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(
        String(userId),
      )
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid authenticated userId",
      });
    }

    const filter: any = {
      sellerId:
        new mongoose.Types.ObjectId(
          String(userId),
        ),
    };

    if (status) {
      filter.status =
        String(status);
    }

    const earnings =
      await SellerEarningModel.find(
        filter,
      )
        .sort({
          capturedAt: 1,
        })
        .lean();

    const totals =
      earnings.reduce(
        (
          acc,
          earning: any,
        ) => {
          const amount =
            Number(
              earning.sellerEarning ||
                0,
            );

          if (
            earning.status ===
            "HOLDING"
          ) {
            acc.holding +=
              amount;
          }

          if (
            earning.status ===
            "PAYOUT_AVAILABLE"
          ) {
            acc.payoutAvailable +=
              amount;
          }

          if (
            earning.status ===
            "WALLET_AVAILABLE"
          ) {
            acc.walletAvailable +=
              amount;
          }

          return acc;
        },
        {
          holding: 0,
          payoutAvailable: 0,
          walletAvailable: 0,
        },
      );

    return res.status(200).json({
      success: true,

      sellerId:
        String(userId),

      totals: {
        holding: Number(
          totals.holding.toFixed(
            2,
          ),
        ),

        payoutAvailable:
          Number(
            totals.payoutAvailable.toFixed(
              2,
            ),
          ),

        walletAvailable:
          Number(
            totals.walletAvailable.toFixed(
              2,
            ),
          ),
      },

      count:
        earnings.length,

      data: earnings,
    });
  } catch (error: any) {
    console.error(
      "[SELLER EARNING GET ERROR]",
      error,
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch seller earnings",
    });
  }
};

// ============================================================
// COMPANY
// ============================================================

export const createCompanyEarning = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { orderId } =
      req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message:
          "orderId is required",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(
        orderId,
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid orderId",
      });
    }

    const order =
      await Order.findById(
        orderId,
      );

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found",
      });
    }

    if (
      !isCapturedOrder(order)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Company earning can only be created for a captured payment",
      });
    }

    const existingEarning =
      await CompanyEarningModel.findOne(
        {
          orderId:
            order._id,
        },
      );

    if (existingEarning) {
      return res.status(200).json({
        success: true,
        message:
          "Company earning already exists",
        data:
          existingEarning,
      });
    }

    const capturedAt =
      getCapturedAt(order);

    const grossAmount =
      Number(
        Number(
          order.finalAmount ||
            0,
        ).toFixed(2),
      );

    const platformFee =
      Number(
        Number(
          order.platformFee ||
            0,
        ).toFixed(2),
      );

    const productGst =
      Number(
        Number(
          order.productGst ||
            0,
        ).toFixed(2),
      );

    const companyEarning =
      calculateCompanyEarning(
        order,
      );

    const payoutId =
      generatePayoutId("cpp");

    const earning =
      await CompanyEarningModel.create(
        {
          payoutId,

          orderId:
            order._id,

          transactionId:
            order.transactionId,

          orderNumber:
            order.orderId,

          grossAmount,

          platformFee,

          productGst,

          companyEarning,
        },
      );

    return res.status(201).json({
      success: true,
      message:
        "Company earning created successfully",
      data: earning,
    });
  } catch (error: any) {
    console.error(
      "[COMPANY EARNING CREATE ERROR]",
      error,
    );

    if (error?.code === 11000) {
      const existingEarning =
        await CompanyEarningModel.findOne(
          {
            orderId:
              req.body.orderId,
          },
        );

      return res.status(200).json({
        success: true,
        message:
          "Company earning already exists",
        data:
          existingEarning,
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Failed to create company earning",
    });
  }
};

// ============================================================
// COMPANY PANEL
// ============================================================

export const getCompanyEarnings = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const earnings =
      await CompanyEarningModel.find(
        {},
      )
        .sort({
          createdAt: 1,
        })
        .lean();

    const totals =
      earnings.reduce(
        (
          acc,
          earning: any,
        ) => {
          const amount =
            Number(
              earning.companyEarning ||
                0,
            );

          const platformFee =
            Number(
              earning.platformFee ||
                0,
            );

          const productGst =
            Number(
              earning.productGst ||
                0,
            );

          acc.companyEarning +=
            amount;

          acc.platformFee +=
            platformFee;

          acc.productGst +=
            productGst;

          return acc;
        },
        {
          companyEarning: 0,
          platformFee: 0,
          productGst: 0,
        },
      );

    return res.status(200).json({
      success: true,

      totals: {
        companyEarning:
          Number(
            totals.companyEarning.toFixed(
              2,
            ),
          ),

        platformFee:
          Number(
            totals.platformFee.toFixed(
              2,
            ),
          ),

        productGst:
          Number(
            totals.productGst.toFixed(
              2,
            ),
          ),
      },

      count:
        earnings.length,

      data: earnings,
    });
  } catch (error: any) {
    console.error(
      "[COMPANY EARNING GET ERROR]",
      error,
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch company earnings",
    });
  }
};
