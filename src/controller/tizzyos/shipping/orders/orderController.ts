import { Request, Response } from "express";
import Order from "../../../../models/tizzyos/shipping/order/order";
import DeliveryTracking from "../../../../models/tizzyos/shipping/order/deliveryTracking";

// 📦 Fetch orders for a specific seller
export const getSellerOrders = async (req: Request, res: Response) => {
  try {
    const { sellerId } = req.query;

    if (!sellerId) {
      return res.status(400).json({
        success: false,
        message: "sellerId required",
      });
    }

    console.log("📦 Fetching orders from DB for seller:", sellerId);

    const orders = await Order.find({
      sellerId,
      status: { $in: ["captured", "cod_confirmed"] },
    })
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ ${orders.length} orders found`);

    const ordersWithTrackingStatus = await Promise.all(
      orders.map(async (order: any) => {
        const tracking = (await DeliveryTracking.findOne({
          orderId: order.orderId,
        }).lean()) as { trackingHistory?: any[] } | null;

        const sellerAccepted =
          tracking?.trackingHistory?.some(
            (item: any) =>
              item.holderType === "SELLER" &&
              item.status === "waiting_for_assignment",
          ) || false;

        return {
          ...order,
          sellerAccepted,
        };
      }),
    );

    return res.json({
      success: true,
      orders: ordersWithTrackingStatus,
    });
  } catch (err) {
    console.error("❌ Seller orders fetch error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
    });
  }
};
