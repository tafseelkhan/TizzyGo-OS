// src/modules/tracking/tracking.controller.ts

import { Request, Response } from "express";
import { TrackingService } from "../../../../services/tizzyos/shippings/trackOrderServices";
import {
  validateProximityRequest,
  validateLiveTrackingRequest,
} from "../../../../utils/tizzyos/shippings/trackingValidation";

const trackingService = new TrackingService();

export class TrackingController {
  /**
   * GET /tracking/proximity/:orderId
   * Check if handover is allowed based on proximity
   */
  async checkProximity(req: Request, res: Response): Promise<void> {
    try {
      // Validate request
      const { error } = validateProximityRequest(req.params);
      if (error) {
        res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
        return;
      }

      const { orderId } = req.params;
      console.log("orderId:", orderId);

      const result = await trackingService.checkProximity(orderId);

      res.status(200).json(result);
    } catch (error: any) {
      console.error("Proximity check controller error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  /**
   * GET /tracking/live/:orderId
   * Get live tracking info for buyer
   */
  async getLiveTracking(req: Request, res: Response): Promise<void> {
    try {
      // Validate request
      const { error } = validateLiveTrackingRequest(req.params);
      if (error) {
        res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
        return;
      }

      const { orderId } = req.params;

      const result = await trackingService.getLiveTracking(orderId);

      res.status(200).json(result);
    } catch (error: any) {
      console.error("Live tracking controller error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }
}
