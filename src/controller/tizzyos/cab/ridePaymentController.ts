import { Request, Response } from "express";
import {
  RidePaymentService,
  PaymentMethod,
  PaymentStatus,
} from "../../../services/tizzyos/cab/ridePaymentService";

export const processPayment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const { paymentMethod, paymentDetails } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (
      !paymentMethod ||
      !Object.values(PaymentMethod).includes(paymentMethod)
    ) {
      res.status(400).json({
        success: false,
        message: "Valid payment method is required",
      });
      return;
    }

    const paymentService = new RidePaymentService();
    const result = await paymentService.processPayment(
      bookingId,
      paymentMethod,
      paymentDetails || {},
    );

    res.status(200).json({
      success: true,
      data: result,
      message: "Payment processed successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to process payment";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const getPaymentStatus = async (
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

    const paymentService = new RidePaymentService();
    const payment = await paymentService.getPaymentByBooking(bookingId);

    res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get payment status";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const refundPayment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const { amount, reason, metadata } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!reason || reason.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: "Refund reason is required",
      });
      return;
    }

    const paymentService = new RidePaymentService();
    const result = await paymentService.refundPayment(bookingId, {
      amount,
      reason,
      metadata,
    });

    res.status(200).json({
      success: true,
      data: result,
      message: "Payment refunded successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to refund payment";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const cancelPayment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (!reason || reason.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: "Cancellation reason is required",
      });
      return;
    }

    const paymentService = new RidePaymentService();
    const result = await paymentService.cancelPayment(bookingId, reason);

    res.status(200).json({
      success: true,
      data: result,
      message: "Payment cancelled successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to cancel payment";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const paymentWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { bookingId, status, transactionId, metadata } = req.body;

    if (!bookingId || !status) {
      res.status(400).json({
        success: false,
        message: "Booking ID and status are required",
      });
      return;
    }

    const paymentService = new RidePaymentService();

    // Handle webhook based on status
    if (status === "COMPLETED" || status === "Paid") {
      await paymentService.updatePaymentStatus(bookingId, PaymentStatus.COMPLETED, {
        transactionId,
        webhookData: metadata,
        webhookReceivedAt: new Date().toISOString(),
      });
    } else if (status === "FAILED" || status === "Failed") {
      await paymentService.updatePaymentStatus(bookingId, PaymentStatus.FAILED, {
        transactionId,
        webhookData: metadata,
        webhookReceivedAt: new Date().toISOString(),
      });
    }

    res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to process webhook";
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
};
