import { Request, Response } from "express";
import {
  RidePaymentService,
} from "../../../services/tizzyos/cab/ridePaymentService";

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Payment request failed";

const getSingleStringParam = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

/**
 * POST /payments/:bookingId/order
 * Server-side Razorpay order creation.
 */
export const createOnlineOrder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const bookingId = getSingleStringParam(req.params.bookingId);
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    if (!bookingId) {
      res.status(400).json({
        success: false,
        message: "Booking ID is required",
      });
      return;
    }

    const paymentService = new RidePaymentService();
    const result = await paymentService.createOnlineOrder(bookingId);

    res.status(200).json({
      success: true,
      message: "Online payment order created successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

/**
 * POST /payments/:bookingId/verify
 * Verifies Razorpay Checkout signature and captured payment.
 */
export const verifyOnlinePayment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const bookingId = getSingleStringParam(req.params.bookingId);
    const userId = req.user?.id;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body ?? {};

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    if (
      !bookingId ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      res.status(400).json({
        success: false,
        message:
          "Booking ID, Razorpay order ID, payment ID and signature are required",
      });
      return;
    }

    const paymentService = new RidePaymentService();

    const result = await paymentService.verifyOnlinePayment(
      bookingId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

/**
 * POST /payments/:bookingId/collect-cash
 * Call only from the authenticated driver app after drop verification.
 */
export const collectCashPayment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const bookingId = getSingleStringParam(req.params.bookingId);
    const driverId = req.user?.id;

    if (!driverId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    if (!bookingId) {
      res.status(400).json({
        success: false,
        message: "Booking ID is required",
      });
      return;
    }

    const paymentService = new RidePaymentService();

    // Driver ID is taken from authenticated server-side identity,
    // never from req.body.
    const result = await paymentService.collectCash(
      bookingId,
      driverId,
    );

    res.status(200).json({
      success: true,
      message: "Cash payment recorded successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

/**
 * GET /payments/:bookingId/status
 */
export const getPaymentStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const bookingId = getSingleStringParam(req.params.bookingId);
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    if (!bookingId) {
      res.status(400).json({
        success: false,
        message: "Booking ID is required",
      });
      return;
    }

    const paymentService = new RidePaymentService();
    const payment = await paymentService.getPaymentByBooking(bookingId);

    if (!payment) {
      res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

/**
 * POST /payments/webhook
 *
 * IMPORTANT:
 * req.body must be the raw Buffer, not parsed JSON.
 * Razorpay's signature must be verified by the payment service.
 */
export const paymentWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const signature = req.header("x-razorpay-signature");

    if (!signature) {
      res.status(400).json({
        success: false,
        message: "Missing Razorpay webhook signature",
      });
      return;
    }

    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({
        success: false,
        message:
          "Raw webhook body is required. Check express.raw() middleware order.",
      });
      return;
    }

    const paymentService = new RidePaymentService();

    await paymentService.handleRazorpayWebhook(
      req.body,
      signature,
    );

    res.status(200).json({
      success: true,
      message: "Razorpay webhook processed",
    });
  } catch (error) {
    // Invalid signatures must not be acknowledged as successful.
    res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

/**
 * Refund is intentionally disabled until a real refund method is
 * implemented in RidePaymentService and verified against Razorpay.
 */
export const refundPayment = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.status(501).json({
    success: false,
    message:
      "Refund processing is not implemented yet. No refund has been issued.",
  });
};

/**
 * Payment cancellation is not the same as cancelling a ride.
 * Do not mark a payment cancelled without implementing this in the service.
 */
export const cancelPayment = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.status(501).json({
    success: false,
    message:
      "Payment cancellation is not implemented yet. No payment status was changed.",
  });
};