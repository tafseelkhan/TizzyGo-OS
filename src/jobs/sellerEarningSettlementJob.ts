import SellerEarningModel from "../models/tizzyos/PayOutPortal/sellerEarnings";
import DeliveryChargeEarningModel from "../models/tizzyos/PayOutPortal/deliveryChargeEarnings";

let jobRunning = false;

export const processSellerEarnings = async (): Promise<void> => {
  if (jobRunning) {
    console.log(
      "[SELLER + DELIVERY EARNING JOB] Previous job is still running. Skipping.",
    );
    return;
  }

  jobRunning = true;

  try {
    const now = new Date();

    console.log(
      `[SELLER + DELIVERY EARNING JOB] Started: ${now.toISOString()}`,
    );

    /**
     * =========================================================
     * 1. SELLER EARNINGS
     * HOLDING → PAYOUT_AVAILABLE
     * =========================================================
     */
    const sellerHoldingEarnings =
      await SellerEarningModel.find({
        status: "HOLDING",
        holdUntil: { $lte: now },
      })
        .sort({ holdUntil: 1 })
        .limit(1000);

    let sellerMovedToPayout = 0;

    for (const earning of sellerHoldingEarnings) {
      const result = await SellerEarningModel.updateOne(
        {
          _id: earning._id,
          status: "HOLDING",
          holdUntil: { $lte: now },
        },
        {
          $set: {
            status: "PAYOUT_AVAILABLE",
          },
        },
      );

      if (result.modifiedCount === 1) {
        sellerMovedToPayout++;
      }
    }

    /**
     * =========================================================
     * 2. SELLER EARNINGS
     * PAYOUT_AVAILABLE → WALLET_AVAILABLE
     * =========================================================
     */
    const sellerPayoutEarnings =
      await SellerEarningModel.find({
        status: "PAYOUT_AVAILABLE",
        walletAvailableAt: { $lte: now },
      })
        .sort({ walletAvailableAt: 1 })
        .limit(1000);

    let sellerMovedToWallet = 0;

    for (const earning of sellerPayoutEarnings) {
      const result = await SellerEarningModel.updateOne(
        {
          _id: earning._id,
          status: "PAYOUT_AVAILABLE",
          walletAvailableAt: { $lte: now },
        },
        {
          $set: {
            status: "WALLET_AVAILABLE",
          },
        },
      );

      if (result.modifiedCount === 1) {
        sellerMovedToWallet++;
      }
    }

    /**
     * =========================================================
     * 3. DELIVERY EARNINGS
     * HOLDING → PAYOUT_AVAILABLE
     * =========================================================
     */
    const deliveryHoldingEarnings =
      await DeliveryChargeEarningModel.find({
        status: "HOLDING",
        holdUntil: { $lte: now },
      })
        .sort({ holdUntil: 1 })
        .limit(1000);

    let deliveryMovedToPayout = 0;

    for (const earning of deliveryHoldingEarnings) {
      const result = await DeliveryChargeEarningModel.updateOne(
        {
          _id: earning._id,
          status: "HOLDING",
          holdUntil: { $lte: now },
        },
        {
          $set: {
            status: "PAYOUT_AVAILABLE",
          },
        },
      );

      if (result.modifiedCount === 1) {
        deliveryMovedToPayout++;
      }
    }

    /**
     * =========================================================
     * 4. DELIVERY EARNINGS
     * PAYOUT_AVAILABLE → WALLET_AVAILABLE
     * =========================================================
     */
    const deliveryPayoutEarnings =
      await DeliveryChargeEarningModel.find({
        status: "PAYOUT_AVAILABLE",
        walletAvailableAt: { $lte: now },
      })
        .sort({ walletAvailableAt: 1 })
        .limit(1000);

    let deliveryMovedToWallet = 0;

    for (const earning of deliveryPayoutEarnings) {
      const result = await DeliveryChargeEarningModel.updateOne(
        {
          _id: earning._id,
          status: "PAYOUT_AVAILABLE",
          walletAvailableAt: { $lte: now },
        },
        {
          $set: {
            status: "WALLET_AVAILABLE",
          },
        },
      );

      if (result.modifiedCount === 1) {
        deliveryMovedToWallet++;
      }
    }

    /**
     * =========================================================
     * FINAL LOG
     * =========================================================
     */
    console.log("[SELLER + DELIVERY EARNING JOB] Completed", {
      checkedAt: now.toISOString(),

      seller: {
        movedToPayout: sellerMovedToPayout,
        movedToWallet: sellerMovedToWallet,
      },

      delivery: {
        movedToPayout: deliveryMovedToPayout,
        movedToWallet: deliveryMovedToWallet,
      },
    });
  } catch (error: any) {
    console.error("[SELLER + DELIVERY EARNING JOB ERROR]", {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });
  } finally {
    jobRunning = false;
  }
};
