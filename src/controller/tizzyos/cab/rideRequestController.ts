// controllers/tizzyos/cab/rideRequestController.ts

import { Request, Response } from "express";
import { RideDispatchService } from "../../../services/tizzyos/cab/rideDispatchService";
import { RideRequestService } from "../../../services/tizzyos/cab/rideRequestService";

export const acceptRequest = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { requestId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const dispatchService = new RideDispatchService();
    const requestService = new RideRequestService();

    const request = await requestService.getRequest(requestId);

    if (!request) {
      res.status(404).json({ success: false, message: "Request not found" });
      return;
    }

    if (request.driverId.toString() !== userId) {
      res.status(403).json({
        success: false,
        message: "Not authorized for this request",
      });
      return;
    }

    // ✅ CHANGED: Now handleDriverAccept returns trackingId string
    const trackingId = await dispatchService.handleDriverAccept(
      request.bookingId,
      requestId,
    );

    // ✅ CHANGED: Response includes trackingId in data
    res.status(200).json({
      success: true,
      message: "Request accepted successfully",
      data: {
        trackingId: trackingId,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to accept request";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const rejectRequest = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { requestId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const dispatchService = new RideDispatchService();
    const requestService = new RideRequestService();

    const request = await requestService.getRequest(requestId);

    if (!request) {
      res.status(404).json({ success: false, message: "Request not found" });
      return;
    }

    if (request.driverId.toString() !== userId) {
      res.status(403).json({
        success: false,
        message: "Not authorized for this request",
      });
      return;
    }

    await dispatchService.handleDriverReject(request.bookingId, requestId);

    res.status(200).json({
      success: true,
      message: "Request rejected successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to reject request";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const getBookingRequests = async (
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

    const requestService = new RideRequestService();
    const requests = await requestService.getRequestsByBooking(bookingId);

    res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get requests";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const getDriverRequests = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const requestService = new RideRequestService();
    const requests = await requestService.getRequestsByDriver(userId);

    res.status(200).json({
      success: true,
      data: requests,
      count: requests.length,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get driver requests";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const getPendingRequests = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const requestService = new RideRequestService();
    const requests = await requestService.getPendingRequestsByDriver(userId);

    res.status(200).json({
      success: true,
      data: requests,
      count: requests.length,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get pending requests";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const getRequestStats = async (
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

    const requestService = new RideRequestService();
    const stats = await requestService.getRequestStats(bookingId);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get request stats";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};
