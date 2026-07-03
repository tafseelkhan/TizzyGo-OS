import mongoose from "mongoose";
import RidePayment, { IRidePayment } from "../../../models/tizzyos/cab/ridePayment";
import RideBooking from "../../../models/tizzyos/cab/rideBooking";

export enum PaymentStatus {
  PENDING = "Pending",
  COMPLETED = "Paid",
  FAILED = "Failed",
  REFUNDED = "Refunded",
  CANCELLED = "Cancelled",
  PARTIALLY_REFUNDED = "PartiallyRefunded",
}

export enum PaymentMethod {
  COC = "COC",
  ONLINE = "ONLINE",
  WALLET = "WALLET",
}

export enum PaymentGateway {
  RAZORPAY = "razorpay",
  STRIPE = "stripe",
  PAYPAL = "paypal",
}

interface IPaymentDetails {
  gateway?: PaymentGateway;
  gatewayTransactionId?: string;
  cardDetails?: {
    last4?: string;
    brand?: string;
    expiryMonth?: string;
    expiryYear?: string;
  };
  upiId?: string;
  walletId?: string;
  paymentIntent?: string;
  clientSecret?: string;
  metadata?: Map<string, any> | Record<string, any>;
}

interface IRefundDetails {
  amount?: number;
  reason: string;
  metadata?: Record<string, any>;
}

interface IPaymentResult {
  success: boolean;
  payment: IRidePayment;
  booking: any;
  message?: string;
}

export class RidePaymentService {
  private readonly MAX_REFUND_ATTEMPTS = 3;

  async processPayment(
    bookingId: string,
    method: PaymentMethod,
    paymentDetails: IPaymentDetails = {},
  ): Promise<IPaymentResult> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const booking = await RideBooking.findOne({ bookingId })
        .session(session)
        .lean();

      if (!booking) {
        throw new Error(`Booking not found: ${bookingId}`);
      }

      const bookingAny = booking as any;

      if (bookingAny.paymentStatus === PaymentStatus.COMPLETED) {
        throw new Error("Payment already completed");
      }

      if (bookingAny.paymentStatus === PaymentStatus.REFUNDED) {
        throw new Error("Payment has been refunded");
      }

      const driverId = booking.driverId
        ? this.validateObjectId(booking.driverId)
        : undefined;
      const customerId = this.validateObjectId(booking.customerId);
      const rideId = this.validateObjectId(booking._id);

      const amount = booking.fare?.totalFare || 0;

      if (amount <= 0) {
        throw new Error(`Invalid payment amount: ${amount}`);
      }

      const normalizedMetadata = paymentDetails.metadata
        ? paymentDetails.metadata instanceof Map
          ? paymentDetails.metadata
          : new Map(Object.entries(paymentDetails.metadata))
        : undefined;

      const paymentData: Partial<IRidePayment> = {
        bookingId: booking.bookingId,
        rideId,
        customerId,
        driverId,
        amount,
        method: method as "COC" | "ONLINE" | undefined,
        status: PaymentStatus.PENDING,
        metadata: normalizedMetadata,
      };

      const payment = new RidePayment(paymentData);
      const paymentDoc = payment as any;

      if (method === PaymentMethod.ONLINE) {
        await this.processOnlinePayment(paymentDoc, paymentDetails);
        paymentDoc.status = PaymentStatus.COMPLETED;
        paymentDoc.paidAt = new Date();

        if (paymentDetails.gatewayTransactionId) {
          paymentDoc.transactionId = paymentDetails.gatewayTransactionId;
        } else {
          paymentDoc.transactionId = this.generateTransactionId(
            PaymentGateway.RAZORPAY,
          );
        }
      } else if (method === PaymentMethod.WALLET) {
        await this.processWalletPayment(paymentDoc, paymentDetails);
        paymentDoc.status = PaymentStatus.COMPLETED;
        paymentDoc.paidAt = new Date();
        paymentDoc.transactionId = this.generateTransactionId("wallet");
      } else {
        paymentDoc.status = PaymentStatus.PENDING;
        paymentDoc.transactionId = null;
      }

      await paymentDoc.save({ session });

      const paymentStatus = paymentDoc.status as PaymentStatus;

      const bookingUpdate: any = {
        paymentStatus: paymentStatus,
      };

      if (paymentStatus === PaymentStatus.COMPLETED) {
        bookingUpdate.status = "completed";
        bookingUpdate.completedAt = new Date();
        bookingUpdate.paymentCompletedAt = new Date();
      } else if (paymentStatus === PaymentStatus.PENDING) {
        bookingUpdate.status = "paymentPending";
      } else if (paymentStatus === PaymentStatus.FAILED) {
        bookingUpdate.status = "paymentFailed";
      }

      const updatedBooking = await RideBooking.findOneAndUpdate(
        { bookingId },
        { $set: bookingUpdate },
        {
          session,
          new: true,
          runValidators: true,
        },
      );

      await session.commitTransaction();

      return {
        success: paymentStatus === PaymentStatus.COMPLETED,
        payment: paymentDoc.toObject(),
        booking: updatedBooking,
        message:
          paymentStatus === PaymentStatus.COMPLETED
            ? "Payment processed successfully"
            : `Payment status: ${paymentStatus}`,
      };
    } catch (error) {
      await session.abortTransaction();
      throw new Error(
        `Payment processing failed: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
      );
    } finally {
      await session.endSession();
    }
  }

  private async processOnlinePayment(
    payment: any,
    details: IPaymentDetails,
  ): Promise<void> {
    try {
      const gateway = details.gateway || PaymentGateway.RAZORPAY;

      switch (gateway) {
        case PaymentGateway.RAZORPAY:
          payment.gatewayOrderId = details.paymentIntent || "order_placeholder";
          payment.gatewayPaymentId = details.gatewayTransactionId;
          break;
        case PaymentGateway.STRIPE:
          payment.gatewayPaymentId = details.paymentIntent;
          payment.metadata = payment.metadata || new Map();
          payment.metadata.set("clientSecret", details.clientSecret);
          break;
        case PaymentGateway.PAYPAL:
          payment.gatewayOrderId = details.paymentIntent;
          break;
        default:
          throw new Error(`Unsupported payment gateway: ${gateway}`);
      }

      payment.gateway = gateway;

      if (details.cardDetails) {
        payment.metadata = payment.metadata || new Map();
        payment.metadata.set("cardLast4", details.cardDetails.last4);
        payment.metadata.set("cardBrand", details.cardDetails.brand);
        payment.metadata.set(
          "cardExpiryMonth",
          details.cardDetails.expiryMonth,
        );
        payment.metadata.set("cardExpiryYear", details.cardDetails.expiryYear);
      }

      if (details.upiId) {
        payment.metadata = payment.metadata || new Map();
        payment.metadata.set("upiId", details.upiId);
      }

      if (details.walletId) {
        payment.metadata = payment.metadata || new Map();
        payment.metadata.set("walletId", details.walletId);
      }
    } catch (error) {
      throw new Error(
        `Online payment processing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private async processWalletPayment(
    payment: any,
    details: IPaymentDetails,
  ): Promise<void> {
    if (!details.walletId) {
      throw new Error("Wallet ID is required for wallet payments");
    }

    payment.metadata = payment.metadata || new Map();
    payment.metadata.set("walletId", details.walletId);
    payment.metadata.set("walletTransactionId", details.gatewayTransactionId);
  }

  async getPaymentByBooking(bookingId: string): Promise<IRidePayment> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    const payment = await RidePayment.findOne({ bookingId }).lean().exec();

    if (!payment) {
      throw new Error(`Payment not found for booking: ${bookingId}`);
    }

    return payment;
  }

  async getPaymentByTransactionId(
    transactionId: string,
  ): Promise<IRidePayment> {
    if (!transactionId || typeof transactionId !== "string") {
      throw new Error("Invalid transaction ID");
    }

    const payment = await RidePayment.findOne({ transactionId }).lean().exec();

    if (!payment) {
      throw new Error(`Payment not found for transaction: ${transactionId}`);
    }

    return payment;
  }

  async refundPayment(
    bookingId: string,
    refundDetails: IRefundDetails,
  ): Promise<IPaymentResult> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    if (!refundDetails.reason || typeof refundDetails.reason !== "string") {
      throw new Error("Refund reason is required");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const payment = await RidePayment.findOne({ bookingId }).session(session);

      if (!payment) {
        throw new Error(`Payment not found for booking: ${bookingId}`);
      }

      const paymentAny = payment as any;

      if (paymentAny.status === PaymentStatus.REFUNDED) {
        throw new Error("Payment already refunded");
      }

      if (paymentAny.status !== PaymentStatus.COMPLETED) {
        throw new Error(
          `Cannot refund payment with status: ${paymentAny.status}`,
        );
      }

      const refundAmount = refundDetails.amount || payment.amount;

      if (refundAmount <= 0 || refundAmount > payment.amount) {
        throw new Error(`Invalid refund amount: ${refundAmount}`);
      }

      const isFullRefund = refundAmount === payment.amount;

      paymentAny.status = isFullRefund
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED;
      paymentAny.refundedAt = new Date();

      const existingMetadata = paymentAny.metadata || {};
      paymentAny.metadata = {
        ...existingMetadata,
        refund: {
          ...refundDetails,
          refundedAt: new Date(),
          isFullRefund,
        },
      };

      await paymentAny.save({ session });

      const bookingUpdate: any = {
        paymentStatus: isFullRefund
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED,
      };

      if (isFullRefund) {
        bookingUpdate.status = "refunded";
        bookingUpdate.refundedAt = new Date();
      }

      const updatedBooking = await RideBooking.findOneAndUpdate(
        { bookingId },
        { $set: bookingUpdate },
        {
          session,
          new: true,
          runValidators: true,
        },
      );

      await session.commitTransaction();

      return {
        success: true,
        payment: paymentAny.toObject(),
        booking: updatedBooking,
        message: isFullRefund
          ? "Payment refunded successfully"
          : "Partial refund processed successfully",
      };
    } catch (error) {
      await session.abortTransaction();
      throw new Error(
        `Refund failed: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
      );
    } finally {
      await session.endSession();
    }
  }

  async cancelPayment(
    bookingId: string,
    reason: string,
  ): Promise<IPaymentResult> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    if (!reason || typeof reason !== "string") {
      throw new Error("Cancellation reason is required");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const payment = await RidePayment.findOne({ bookingId }).session(session);

      if (!payment) {
        throw new Error(`Payment not found for booking: ${bookingId}`);
      }

      const paymentAny = payment as any;

      if (paymentAny.status === PaymentStatus.COMPLETED) {
        throw new Error(
          "Cannot cancel a completed payment. Use refund instead.",
        );
      }

      if (paymentAny.status === PaymentStatus.CANCELLED) {
        throw new Error("Payment already cancelled");
      }

      paymentAny.status = PaymentStatus.CANCELLED;
      const existingMetadata = paymentAny.metadata || {};
      paymentAny.metadata = {
        ...existingMetadata,
        cancelledAt: new Date(),
        cancellationReason: reason,
      };

      await paymentAny.save({ session });

      const updatedBooking = await RideBooking.findOneAndUpdate(
        { bookingId },
        {
          $set: {
            paymentStatus: PaymentStatus.CANCELLED,
            status: "cancelled",
          },
        },
        {
          session,
          new: true,
          runValidators: true,
        },
      );

      await session.commitTransaction();

      return {
        success: true,
        payment: paymentAny.toObject(),
        booking: updatedBooking,
        message: "Payment cancelled successfully",
      };
    } catch (error) {
      await session.abortTransaction();
      throw new Error(
        `Cancellation failed: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
      );
    } finally {
      await session.endSession();
    }
  }

  async getPaymentHistory(
    userId: string | mongoose.Types.ObjectId,
    options: {
      startDate?: Date;
      endDate?: Date;
      status?: PaymentStatus;
      method?: PaymentMethod;
      limit?: number;
      skip?: number;
    } = {},
  ): Promise<IRidePayment[]> {
    const validatedUserId = this.validateObjectId(userId);

    const query: any = {
      $or: [{ customerId: validatedUserId }, { driverId: validatedUserId }],
    };

    if (options.status) {
      query.status = options.status;
    }

    if (options.method) {
      query.method = options.method;
    }

    if (options.startDate || options.endDate) {
      query.paidAt = {};
      if (options.startDate) {
        query.paidAt.$gte = options.startDate;
      }
      if (options.endDate) {
        query.paidAt.$lte = options.endDate;
      }
    }

    const limit = Math.min(options.limit || 50, 100);
    const skip = options.skip || 0;

    return RidePayment.find(query)
      .sort({ paidAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
  }

  async getPaymentStatistics(
    startDate?: Date,
    endDate?: Date,
  ): Promise<Record<string, any>> {
    const match: any = {};

    if (startDate || endDate) {
      match.paidAt = {};
      if (startDate) {
        match.paidAt.$gte = startDate;
      }
      if (endDate) {
        match.paidAt.$lte = endDate;
      }
    }

    const stats = await RidePayment.aggregate([
      {
        $match: match,
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          avgAmount: { $avg: "$amount" },
        },
      },
    ]);

    const totalPayments = await RidePayment.countDocuments(match);
    const totalAmount = await RidePayment.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    return {
      totalPayments,
      totalRevenue: totalAmount.length > 0 ? totalAmount[0].total : 0,
      byStatus: stats,
    };
  }

  async verifyPayment(bookingId: string): Promise<boolean> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    const payment = await RidePayment.findOne({ bookingId }).lean().exec();

    if (!payment) {
      return false;
    }

    return payment.status === PaymentStatus.COMPLETED;
  }

  private generateTransactionId(gateway: string | PaymentGateway): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const gatewayStr = String(gateway);
    return `${gatewayStr.toUpperCase()}-${timestamp}-${random}`.toUpperCase();
  }

  private validateObjectId(
    id: string | mongoose.Types.ObjectId | null | undefined,
  ): mongoose.Types.ObjectId {
    if (!id) {
      throw new Error("ObjectId is required");
    }

    if (id instanceof mongoose.Types.ObjectId) {
      return id;
    }

    if (typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }

    throw new Error(`Invalid ObjectId: ${String(id)}`);
  }

  async retryFailedPayment(
    bookingId: string,
    paymentDetails?: IPaymentDetails,
  ): Promise<IPaymentResult> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const payment = await RidePayment.findOne({ bookingId }).session(session);

      if (!payment) {
        throw new Error(`Payment not found for booking: ${bookingId}`);
      }

      const paymentAny = payment as any;

      if (paymentAny.status !== PaymentStatus.FAILED) {
        throw new Error(
          `Cannot retry payment with status: ${paymentAny.status}`,
        );
      }

      const retryCount = (paymentAny.metadata?.retryCount || 0) + 1;

      if (retryCount > this.MAX_REFUND_ATTEMPTS) {
        throw new Error(
          `Maximum retry attempts (${this.MAX_REFUND_ATTEMPTS}) exceeded`,
        );
      }

      const updatedDetails = {
        ...(paymentDetails || {}),
        metadata: {
          ...(paymentAny.metadata || {}),
          retryCount,
          lastRetryAt: new Date(),
        },
      };

      paymentAny.status = PaymentStatus.PENDING;
      paymentAny.metadata = updatedDetails.metadata;

      if (paymentDetails?.gatewayTransactionId) {
        paymentAny.transactionId = paymentDetails.gatewayTransactionId;
      }

      await paymentAny.save({ session });

      const updatedBooking = await RideBooking.findOneAndUpdate(
        { bookingId },
        { $set: { paymentStatus: PaymentStatus.PENDING } },
        {
          session,
          new: true,
          runValidators: true,
        },
      );

      await session.commitTransaction();

      return {
        success: true,
        payment: paymentAny.toObject(),
        booking: updatedBooking,
        message: `Payment retry initiated (attempt ${retryCount})`,
      };
    } catch (error) {
      await session.abortTransaction();
      throw new Error(
        `Retry failed: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
      );
    } finally {
      await session.endSession();
    }
  }

  async updatePaymentStatus(
    bookingId: string,
    status: PaymentStatus,
    metadata?: Record<string, any>,
  ): Promise<IRidePayment> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    if (!Object.values(PaymentStatus).includes(status)) {
      throw new Error(`Invalid payment status: ${status}`);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const payment = await RidePayment.findOne({ bookingId }).session(session);

      if (!payment) {
        throw new Error(`Payment not found for booking: ${bookingId}`);
      }

      const paymentAny = payment as any;

      paymentAny.status = status;

      if (metadata) {
        const existingMetadata = paymentAny.metadata || {};
        paymentAny.metadata = { ...existingMetadata, ...metadata };
      }

      if (status === PaymentStatus.COMPLETED && !paymentAny.paidAt) {
        paymentAny.paidAt = new Date();
      }

      if (status === PaymentStatus.FAILED) {
        const existingMetadata = paymentAny.metadata || {};
        paymentAny.metadata = { ...existingMetadata, failedAt: new Date() };
      }

      await paymentAny.save({ session });

      const bookingUpdate: any = { paymentStatus: status };

      if (status === PaymentStatus.COMPLETED) {
        bookingUpdate.status = "completed";
        bookingUpdate.completedAt = new Date();
        bookingUpdate.paymentCompletedAt = new Date();
      } else if (status === PaymentStatus.FAILED) {
        bookingUpdate.status = "paymentFailed";
      }

      await RideBooking.findOneAndUpdate(
        { bookingId },
        { $set: bookingUpdate },
        {
          session,
          runValidators: true,
        },
      );

      await session.commitTransaction();
      return paymentAny.toObject();
    } catch (error) {
      await session.abortTransaction();
      throw new Error(
        `Status update failed: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
      );
    } finally {
      await session.endSession();
    }
  }
}
