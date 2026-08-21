// src/controllers/orderTrackingController.ts

import { Request, Response } from "express";
import { OrderTrackingService } from "../../../../services/tizzygo/orderTrackingService";

const trackingService = new OrderTrackingService();

export class OrderTrackingController {
  /**
   * GET /api/order-tracking/:orderId
   * Get complete tracking data for an order
   *
   * ✅ RETURNS COMPLETE DATA:
   * - Full order details with seller/buyer info
   * - Complete tracking with history
   * - Real-time rider location
   * - Distance and ETA
   * - Timeline with all events
   * - FWS and shipping partner info
   *
   * ✅ SUPPORTS:
   * - Tracking exists → Full tracking data
   * - Tracking NOT exists → Pending seller acceptance response
   * - NO "Tracking not found" error
   */
  async getTrackingData(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "Authentication required",
        });
      }

      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: "Order ID is required",
        });
      }

      const data = await trackingService.getInitialTrackingData(
        orderId,
        userId,
      );

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      console.error("❌ Error in getTrackingData:", error);

      // Handle specific errors
      if (error.message === "Order not found or unauthorized") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch tracking data",
      });
    }
  }

  /**
   * GET /api/order-tracking/:orderId/status
   * Get only current status (lightweight)
   */
  async getOrderStatus(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "Authentication required",
        });
      }

      const data = await trackingService.getInitialTrackingData(
        orderId,
        userId,
      );

      return res.status(200).json({
        success: true,
        data: {
          orderId: data.order.orderId,
          trackingCreated: data.trackingCreated,
          currentStatus: data.currentStatus,
          isDelivered: data.isDelivered,
          isCancelled: data.isCancelled,
          eta: data.eta,
          distance: data.distance,
          trackingAvailable: data.trackingAvailable,
        },
      });
    } catch (error: any) {
      console.error("❌ Error in getOrderStatus:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch order status",
      });
    }
  }

  /**
   * GET /api/order-tracking/:orderId/order
   * Get only order details (without tracking)
   */
  async getOrderDetails(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "Authentication required",
        });
      }

      const order = await trackingService.getOrderDetails(orderId, userId);

      return res.status(200).json({
        success: true,
        data: order,
      });
    } catch (error: any) {
      console.error("❌ Error in getOrderDetails:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch order details",
      });
    }
  }
}