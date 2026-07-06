// controllers/tizzyos/cab/rideQRCodeController.ts

import { Request, Response } from "express";
import { RideQRCodeService } from "../../../services/tizzyos/cab/rideQRCodeService";

export const generateQRCodes = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const qrService = new RideQRCodeService();
    const qrCodes = await qrService.generateQRCodes(bookingId);

    res.status(200).json({
      success: true,
      data: qrCodes,
      message: "QR codes generated successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to generate QR codes";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const verifyPickup = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!token || typeof token !== "string") {
      res.status(400).json({
        success: false,
        message: "Valid token is required",
      });
      return;
    }

    const qrService = new RideQRCodeService();
    const result = await qrService.verifyPickup(token);

    res.status(200).json({
      success: true,
      data: result,
      message: "Pickup verified successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to verify pickup";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const verifyDrop = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!token || typeof token !== "string") {
      res.status(400).json({
        success: false,
        message: "Valid token is required",
      });
      return;
    }

    const qrService = new RideQRCodeService();
    const result = await qrService.verifyDrop(token);

    res.status(200).json({
      success: true,
      data: result,
      message: "Drop verified successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to verify drop";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const validateQRToken = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!token || typeof token !== "string") {
      res.status(400).json({
        success: false,
        message: "Valid token is required",
      });
      return;
    }

    const qrService = new RideQRCodeService();
    const decoded = await qrService.verifyQRToken(token);

    res.status(200).json({
      success: true,
      data: decoded,
      message: "QR token is valid",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to validate QR token";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const getQRStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const qrService = new RideQRCodeService();
    const status = await qrService.getQRCodeStatus(bookingId);

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get QR status";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const regenerateQRCodes = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const qrService = new RideQRCodeService();
    const qrCodes = await qrService.regenerateQRCodes(bookingId);

    res.status(200).json({
      success: true,
      data: qrCodes,
      message: "QR codes regenerated successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to regenerate QR codes";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};
