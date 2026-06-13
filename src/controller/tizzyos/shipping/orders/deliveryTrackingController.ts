// controllers/tracking.controller.ts
import { Response } from "express";
import { TrackingService } from "../../../../services/tizzyos/shippings/trackingServices";
import { AuthRequest } from "../../../../types/tizzyos/trackingTypes";

/**
 * SELLER FLOW APIS
 */
export const sellerAcceptOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }

    const result = await TrackingService.sellerAcceptOrder(orderId, userId);

    res.status(200).json({
      success: true,
      data: result,
      message:
        "Order accepted by seller. Status updated to waiting_for_assignment",
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const deliverToFWS = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, fwsId } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!orderId || !fwsId) {
      return res
        .status(400)
        .json({ error: "Order ID and FWS ID are required" });
    }

    const result = await TrackingService.deliverToFWS(orderId, userId, fwsId);

    res.status(200).json({
      success: true,
      data: result,
      message: "Parcel delivered to FWS successfully",
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const sellerAssignShipping = async (req: AuthRequest, res: Response) => {
  try {
    const {
      orderId,
      shippingId,
      assignmentType = "AUTO",
      shippingType,
    } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }

    if (!shippingType || !["RIDER", "TRUCK"].includes(shippingType)) {
      return res
        .status(400)
        .json({ error: "Valid shipping type (RIDER/TRUCK) is required" });
    }

    if (assignmentType === "MANUAL" && !shippingId) {
      return res
        .status(400)
        .json({ error: "Shipping ID is required for manual assignment" });
    }

    const assignment = await TrackingService.sellerAssignShipping(
      orderId,
      userId,
      shippingId,
      assignmentType,
      shippingType,
    );

    res.status(200).json({
      success: true,
      data: assignment,
      message: `${shippingType} ${assignmentType.toLowerCase()} assigned successfully`,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * FWS FLOW APIS
 */
export const verifyQRAndMarkReadyForDispatch = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { qrData } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!qrData) {
      return res.status(400).json({ error: "QR data is required" });
    }

    const verificationData =
      await TrackingService.verifyQRAndMarkReadyForDispatch(qrData, userId);

    res.status(200).json({
      success: true,
      data: verificationData,
      message: "QR verified and order marked ready for dispatch",
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const fwsAssignShipping = async (req: AuthRequest, res: Response) => {
  try {
    const {
      orderId,
      shippingId,
      assignmentType = "AUTO",
      shippingType,
    } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }

    if (!shippingType || !["RIDER", "TRUCK"].includes(shippingType)) {
      return res
        .status(400)
        .json({ error: "Valid shipping type (RIDER/TRUCK) is required" });
    }

    if (assignmentType === "MANUAL" && !shippingId) {
      return res
        .status(400)
        .json({ error: "Shipping ID is required for manual assignment" });
    }

    const assignment = await TrackingService.fwsAssignShipping(
      orderId,
      userId,
      shippingId,
      assignmentType,
      shippingType,
    );

    res.status(200).json({
      success: true,
      data: assignment,
      message: `${shippingType} ${assignmentType.toLowerCase()} assigned successfully`,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * SHIPPING PARTNER FLOW (RIDER/TRUCK)
 */
export const acceptAssignment = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, assignmentId } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!orderId || !assignmentId) {
      return res
        .status(400)
        .json({ error: "Order ID and assignment ID are required" });
    }

    const result = await TrackingService.acceptAssignment(
      orderId,
      assignmentId,
      userId,
    );

    res.status(200).json({
      success: true,
      data: result,
      message: "Assignment accepted. Tracking created.",
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateHandover = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, toHolderId, toHolderType, notes, location } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!orderId || !toHolderId || !toHolderType) {
      return res
        .status(400)
        .json({ error: "Order ID, toHolderId, and toHolderType are required" });
    }

    const result = await TrackingService.updateHandover(
      orderId,
      userId,
      toHolderId,
      toHolderType,
      notes,
      location,
    );

    res.status(200).json({
      success: true,
      data: result,
      message: "Handover completed successfully",
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * QUERY APIS
 */
export const getTrackingDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }

    const tracking = await TrackingService.getTrackingByOrderId(
      orderId,
      userId,
    );

    res.status(200).json({
      success: true,
      data: tracking,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getSellerOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const orders = await TrackingService.getOrdersBySeller(userId);

    res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getFWSOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const orders = await TrackingService.getOrdersByFWS(userId);

    res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getMyAssignedOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const orders = await TrackingService.getOrdersByShippingPartner(userId);

    res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
