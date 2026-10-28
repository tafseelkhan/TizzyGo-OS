
import crypto from "crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";

import RidePayment, {
  IRidePayment,
} from "../../../models/tizzyos/cab/ridePayment";
import RideBooking from "../../../models/tizzyos/cab/rideBooking";

const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

if (!razorpayKeyId || !razorpayKeySecret) {
  throw new Error("Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET");
}

const razorpay = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: razorpayKeySecret,
});

export enum PaymentStatus {
  PENDING = "Pending",
  PROCESSING = "Processing",
  COMPLETED = "Paid",
  FAILED = "Failed",
  REFUNDED = "Refunded",
}

export enum PaymentMethod {
  COC = "COC",
  ONLINE = "ONLINE",
}

interface PaymentResult {
  success: boolean;
  payment: any;
  booking: any;
  message: string;
}

export class RidePaymentService {
  private validateId(id: string): mongoose.Types.ObjectId {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid ID");
    }
    return new mongoose.Types.ObjectId(id);
  }

  private verifyHmac(
    message: string,
    signature: string,
    secret: string,
  ): boolean {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(message)
      .digest();

    let received: Buffer;

    try {
      received = Buffer.from(signature, "hex");
    } catch {
      return false;
    }

    return (
      received.length === expected.length &&
      crypto.timingSafeEqual(received, expected)
    );
  }

  /**
   * Create a real Razorpay Order.
   * This method does NOT mark the payment as Paid.
   */
  async createOnlineOrder(bookingId: string): Promise<{
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    bookingId: string;
  }> {
    const booking = await RideBooking.findOne({ bookingId });

    if (!booking) throw new Error("Booking not found");
    if (booking.status === "cancelled") {
      throw new Error("Cancelled ride cannot be paid");
    }
    if (booking.paymentStatus === "COMPLETED") {
      throw new Error("Payment already completed");
    }
    if (!booking.driverId) {
      throw new Error("Ride has no assigned driver");
    }
    if (booking.paymentMethod !== "ONLINE") {
      throw new Error("Booking payment method is not ONLINE");
    }

    const amountRupees = Number(booking.fare?.totalFare);

    if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
      throw new Error("Invalid ride fare");
    }

    const amountPaise = Math.round(amountRupees * 100);

    // Reuse a pending order, if one already exists.
    let payment = await RidePayment.findOne({
      rideId: booking._id,
    });

    if (
      payment?.status === PaymentStatus.COMPLETED
    ) {
      throw new Error("Payment already completed");
    }

    if (
      payment?.status === PaymentStatus.PENDING &&
      payment.gatewayOrderId &&
      payment.gateway === "razorpay" &&
      payment.amount === amountRupees
    ) {
      return {
        keyId: razorpayKeyId!,
        orderId: payment.gatewayOrderId,
        amount: amountPaise,
        currency: "INR",
        bookingId,
      };
    }

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `ride_${String(booking._id)}`,
      notes: {
        bookingId: booking.bookingId,
        rideId: String(booking._id),
      },
    });

    if (!payment) {
      payment = new RidePayment({
        bookingId: booking.bookingId,
        rideId: booking._id,
        customerId: booking.customerId,
        driverId: booking.driverId,
        amount: amountRupees,
        platformFee: booking.fare.platformFees || 0,
        gstAmount: booking.fare.gstFare || 0,
        commissionAmount: 0,
        driverEarning: 0,
        method: "ONLINE",
        status: PaymentStatus.PENDING,
      });
    }

    payment.method = "ONLINE";
    payment.amount = amountRupees;
    payment.gateway = "razorpay";
    payment.gatewayOrderId = order.id;
    payment.status = PaymentStatus.PENDING;

    await payment.save();

    await RideBooking.updateOne(
      {
        _id: booking._id,
        paymentStatus: { $ne: "COMPLETED" },
      },
      {
        $set: { status: "paymentPending" },
      },
    );

    return {
      keyId: razorpayKeyId!,
      orderId: order.id,
      amount: amountPaise,
      currency: "INR",
      bookingId,
    };
  }

  /**
   * Verify Razorpay Checkout signature.
   * Call this from an authenticated backend endpoint.
   * A valid signature alone is not enough: confirm captured status.
   */
  async verifyOnlinePayment(
    bookingId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ): Promise<PaymentResult> {
    if (
      !bookingId ||
      !razorpayOrderId ||
      !razorpayPaymentId ||
      !razorpaySignature
    ) {
      throw new Error("Missing Razorpay verification fields");
    }

    const payment = await RidePayment.findOne({
      bookingId,
      gateway: "razorpay",
      gatewayOrderId: razorpayOrderId,
    });

    if (!payment) throw new Error("Payment order not found");

    const valid = this.verifyHmac(
      `${razorpayOrderId}|${razorpayPaymentId}`,
      razorpaySignature,
      razorpayKeySecret!,
    );

    if (!valid) throw new Error("Invalid Razorpay signature");

    // Fetch payment status directly from Razorpay.
    const razorpayPayment = await razorpay.payments.fetch(
      razorpayPaymentId,
    );

    if (String(razorpayPayment.order_id) !== razorpayOrderId) {
      throw new Error("Razorpay order does not match");
    }

    if (Number(razorpayPayment.amount) !== Math.round(payment.amount * 100)) {
      throw new Error("Razorpay amount does not match ride fare");
    }

    if (razorpayPayment.currency !== "INR") {
      throw new Error("Unexpected payment currency");
    }

    if (razorpayPayment.status !== "captured") {
      throw new Error(
        `Payment is not captured (status: ${razorpayPayment.status})`,
      );
    }

    const result = await this.markOnlinePaymentPaid(
      razorpayOrderId,
      razorpayPaymentId,
    );

    return {
      ...result,
      message: "Razorpay payment verified successfully",
    };
  }

  /**
   * Process a Razorpay payment.captured / order.paid webhook.
   * Pass the raw request body and the received signature.
   */
  async handleRazorpayWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<{ received: boolean; message: string }> {
    if (!razorpayWebhookSecret) {
      throw new Error("Missing RAZORPAY_WEBHOOK_SECRET");
    }

    if (!Buffer.isBuffer(rawBody)) {
      throw new Error("Webhook must provide the raw request body");
    }

    if (
      !this.verifyHmac(
        rawBody.toString("utf8"),
        signature,
        razorpayWebhookSecret,
      )
    ) {
      throw new Error("Invalid Razorpay webhook signature");
    }

    const event = JSON.parse(rawBody.toString("utf8"));

    let orderId: string | undefined;
    let paymentId: string | undefined;

    if (event.event === "payment.captured") {
      const entity = event.payload?.payment?.entity;
      orderId = entity?.order_id;
      paymentId = entity?.id;

      if (entity?.status !== "captured") {
        return {
          received: true,
          message: "Payment is not captured; no update made",
        };
      }
    } else if (event.event === "order.paid") {
      const order = event.payload?.order?.entity;
      const entity = event.payload?.payment?.entity;

      orderId = order?.id;
      paymentId = entity?.id;

      if (!orderId || !paymentId) {
        return {
          received: true,
          message: "Order-paid event missing payment details",
        };
      }
    } else {
      return {
        received: true,
        message: `Ignored event: ${String(event.event)}`,
      };
    }

    if (!orderId || !paymentId) {
      throw new Error("Webhook missing order/payment ID");
    }

    await this.markOnlinePaymentPaid(orderId, paymentId);

    return {
      received: true,
      message: "Razorpay payment confirmed",
    };
  }

  /**
   * Shared, idempotent payment confirmation.
   * Booking and payment are updated together.
   */
  private async markOnlinePaymentPaid(
    orderId: string,
    paymentId: string,
  ): Promise<PaymentResult> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const payment = await RidePayment.findOne({
        gateway: "razorpay",
        gatewayOrderId: orderId,
      }).session(session);

      if (!payment) throw new Error("Payment order not found");

      const booking = await RideBooking.findById(
        payment.rideId,
      ).session(session);

      if (!booking) throw new Error("Ride booking not found");

      if (payment.status === PaymentStatus.COMPLETED) {
        await session.commitTransaction();
        return {
          success: true,
          payment,
          booking,
          message: "Payment was already confirmed",
        };
      }

      if (booking.paymentStatus === "COMPLETED") {
        throw new Error("Booking is already marked paid");
      }

      payment.status = PaymentStatus.COMPLETED;
      payment.gatewayPaymentId = paymentId;
      payment.transactionId = paymentId;
      payment.paidAt = new Date();
      payment.paymentCompletedAt = new Date();

      booking.paymentStatus = "COMPLETED";
      booking.paymentCompletedAt = new Date();
      booking.status = "completed";
      booking.completedAt = booking.completedAt || new Date();

      await payment.save({ session });
      await booking.save({ session });

      await session.commitTransaction();

      return {
        success: true,
        payment,
        booking,
        message: "Payment marked as paid",
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * COC: called only after authenticated driver action.
   * Pass the logged-in driver's ID from server-side auth middleware,
   * never from an untrusted client field.
   */
  async collectCash(
    bookingId: string,
    authenticatedDriverId: string,
  ): Promise<PaymentResult> {
    if (!bookingId) throw new Error("Booking ID is required");

    const driverObjectId = this.validateId(authenticatedDriverId);
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const booking = await RideBooking.findOne({
        bookingId,
        driverId: driverObjectId,
      }).session(session);

      if (!booking) {
        throw new Error("Ride not found for this driver");
      }

      if (booking.paymentMethod !== "COC") {
        throw new Error("This ride is not configured for COC");
      }

      if (!booking.dropVerified || booking.status !== "dropVerified") {
        throw new Error("Drop verification must be completed first");
      }

      if (booking.paymentStatus === "COMPLETED") {
        throw new Error("Cash payment has already been collected");
      }

      if (booking.paymentStatus !== "PENDING") {
        throw new Error("Ride is not eligible for cash collection");
      }

      let payment = await RidePayment.findOne({
        rideId: booking._id,
      }).session(session);

      if (payment?.status === PaymentStatus.COMPLETED) {
        throw new Error("Payment already completed");
      }

      if (!payment) {
        payment = new RidePayment({
          bookingId: booking.bookingId,
          rideId: booking._id,
          customerId: booking.customerId,
          driverId: driverObjectId,
          amount: booking.fare.totalFare,
          platformFee: booking.fare.platformFees || 0,
          gstAmount: booking.fare.gstFare || 0,
          commissionAmount: 0,
          driverEarning: 0,
          method: "COC",
          status: PaymentStatus.PENDING,
        });
      }

      payment.method = "COC";
      payment.status = PaymentStatus.COMPLETED;
      payment.paidAt = new Date();
      payment.paymentCompletedAt = new Date();
      payment.transactionId =
        payment.transactionId || `COC-${booking.bookingId}-${Date.now()}`;

      booking.paymentStatus = "COMPLETED";
      booking.paymentCompletedAt = new Date();
      booking.status = "completed";
      booking.completedAt = booking.completedAt || new Date();

      await payment.save({ session });
      await booking.save({ session });

      await session.commitTransaction();

      return {
        success: true,
        payment,
        booking,
        message: "Cash collected and ride completed",
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async getPaymentByBooking(
    bookingId: string,
  ): Promise<IRidePayment | null> {
    return RidePayment.findOne({ bookingId }).exec();
  }

  async verifyPayment(bookingId: string): Promise<boolean> {
    const payment = await RidePayment.findOne({ bookingId }).lean();

    return payment?.status === PaymentStatus.COMPLETED;
  }
}

export default new RidePaymentService();
