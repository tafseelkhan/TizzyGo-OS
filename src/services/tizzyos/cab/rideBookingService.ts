// services/tizzyos/cab/rideBookingService.ts

import mongoose from "mongoose";
import RideBooking from "../../../models/tizzyos/cab/rideBooking";
import RideQuote from "../../../models/tizzyos/cab/rideQuote";
import {
  generateBookingId,
  generateRideCode,
} from "../../../utils/tizzyos/cab/idGenerator";
import { QRTokenService } from "../../../utils/tizzyos/cab/qrToken";
import { generateQRCodeDataURI } from "../../../utils/tizzyos/cab/qrGenerator";
import { GoogleRoutesService } from "../../../interfaces/route/GoogleRoutesService";
import { FareCalculationService } from "../../../interfaces/route/fare/FareCalculationService";

interface IBookingData {
  customerId: string | mongoose.Types.ObjectId;
  quoteId: string; // Quote ID from database
  paymentMethod: "COC" | "ONLINE";
}

interface IUpdateData {
  status?: string;
  customerId?: string | mongoose.Types.ObjectId;
  driverId?: string | mongoose.Types.ObjectId;
  pickupVerified?: boolean;
  dropVerified?: boolean;
  paymentStatus?: string;
  searchCompleted?: boolean;
  currentBatch?: number;
  searchRadius?: number;
  trackingId?: string;
}

export class RideBookingService {
  private readonly qrTokenService: QRTokenService;
  private readonly routeService: GoogleRoutesService;
  private readonly fareService: FareCalculationService;

  constructor() {
    this.qrTokenService = new QRTokenService();
    this.routeService = new GoogleRoutesService();
    this.fareService = new FareCalculationService();
  }

  // =====================================================
  // createBooking
  //
  // Purpose:
  // Creates a booking ONLY after customer presses Book.
  // Uses quoteId to fetch route and fare data from database.
  // Does NOT call Google Routes API again.
  // Locks the fare at the quoted price.
  //
  // Called By:
  // Customer Frontend (POST /api/ride/book)
  //
  // Creates Booking?
  // YES
  //
  // Uses Google Routes API?
  // NO (uses stored route data from quote)
  //
  // Starts Driver Dispatch?
  // YES (calls startDispatch)
  // =====================================================

  async createBooking(bookingData: IBookingData): Promise<any> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const customerId = this.validateObjectId(bookingData.customerId);

      // Get quote from database
      const quote = await RideQuote.findOne({
        quoteId: bookingData.quoteId,
        expiresAt: { $gt: new Date() },
        isUsed: false,
      }).session(session);

      if (!quote) {
        throw new Error("Invalid or expired quote. Please get a new quote.");
      }

      // Mark quote as used
      quote.isUsed = true;
      await quote.save({ session });

      // Use route data from quote (NO Google Routes API call)
      const route = quote.routeData;

      // Use fare from quote (NO recalculation needed)
      const fareComponents = quote.fareComponents;
      const lockedFare = quote.totalFare;

      const booking = new RideBooking({
        bookingId: generateBookingId(),
        rideCode: generateRideCode(),
        customerId: customerId,
        driverId: null, // Will be assigned during dispatch
        vehicle: quote.vehicle,
        pickup: quote.pickup,
        destination: quote.drop,
        paymentMethod: bookingData.paymentMethod || "COC",
        paymentStatus: "PENDING",
        status: "searching",
        searchRadius: 5,
        currentBatch: 0,
        searchCompleted: false,
        pickupVerified: false,
        dropVerified: false,
        distance: route.roadDistanceKm,
        duration: route.trafficDurationMinutes,
        roadDistanceKm: route.roadDistanceKm,
        normalDurationMinutes: route.normalDurationMinutes,
        trafficDurationMinutes: route.trafficDurationMinutes,
        encodedPolyline: route.encodedPolyline,
        routeSummary: route.routeSummary,
        fare: {
          baseFare: fareComponents.baseFare,
          classFare: fareComponents.classFare,
          distanceFare: fareComponents.distanceFare,
          timeFare: fareComponents.timeFare,
          platformFees: fareComponents.platformFees,
          serviceFare: fareComponents.serviceFare,
          subTotal: fareComponents.subTotal,
          gstFare: fareComponents.gstFare,
          totalFare: lockedFare, // Locked fare from quote
          gstPercentage: fareComponents.gstPercentage,
          perKmRate: fareComponents.perKmRate,
          perMinuteRate: fareComponents.perMinuteRate,
        },
        originalFare: lockedFare,
        quoteId: quote.quoteId,
      });

      // Generate QR token (will be regenerated after driver accepts)
      const qrToken = this.qrTokenService.generateQRToken({
        bookingId: booking.bookingId,
        trackingId: "",
        rideId: booking._id as mongoose.Types.ObjectId,
        customerId: customerId,
        driverId: new mongoose.Types.ObjectId(),
        type: "pickup",
      });

      const qrDataURI = await generateQRCodeDataURI(qrToken);

      booking.qr = {
        token: qrToken,
        qrUrl: qrDataURI,
      };

      await booking.save({ session });
      await session.commitTransaction();
      return booking;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // =====================================================
  // updateBookingForRetry
  //
  // Purpose:
  // Updates booking with increased fare for retry.
  // Continues from current batch (does NOT restart).
  //
  // Called By:
  // RideDispatchService during retry
  // =====================================================

  async updateBookingForRetry(
    bookingId: string,
    newFare: number,
    incrementPercentage: number,
  ): Promise<any> {
    const booking = await RideBooking.findOneAndUpdate(
      { bookingId },
      {
        $set: {
          "fare.totalFare": newFare,
          retryFare: newFare,
          lastFareIncrementPercentage: incrementPercentage,
        },
        $inc: { retryAttempts: 1 },
      },
      { returnDocument: "after", runValidators: true },
    );

    if (!booking) {
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    return booking;
  }

  // =====================================================
  // updateBooking
  //
  // Purpose:
  // Generic booking update.
  //
  // Called By:
  // Various services during ride lifecycle
  // =====================================================

  async updateBooking(
    bookingId: string,
    updateData: IUpdateData,
  ): Promise<any> {
    const sanitizedData = this.sanitizeUpdateData(updateData);

    const booking = await RideBooking.findOneAndUpdate(
      { bookingId },
      { $set: sanitizedData },
      { returnDocument: "after", runValidators: true },
    );

    if (!booking) {
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    return booking;
  }

  // =====================================================
  // getBooking
  //
  // Purpose:
  // Retrieves booking by ID.
  //
  // Called By:
  // Various services
  // =====================================================

  async getBooking(bookingId: string): Promise<any> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    const booking = await RideBooking.findOne({ bookingId }).lean();
    if (!booking) {
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    return booking;
  }

  // =====================================================
  // getBookingStatus
  //
  // Purpose:
  // Returns simplified booking status for frontend.
  // Used primarily for reconnect scenarios.
  //
  // Called By:
  // Frontend (GET /api/ride/search-status/:bookingId)
  // =====================================================

  async getBookingStatus(bookingId: string): Promise<any> {
    const booking = await this.getBooking(bookingId);

    return {
      bookingId: booking.bookingId,
      status: booking.status,
      currentBatch: booking.currentBatch,
      searchRadius: booking.searchRadius,
      searchCompleted: booking.searchCompleted,
      driversFound: booking.driversFound || 0,
      elapsedSeconds: booking.searchStartedAt
        ? Math.floor(
            (Date.now() - new Date(booking.searchStartedAt).getTime()) / 1000,
          )
        : 0,
      fare: booking.fare?.totalFare || 0,
      originalFare: booking.originalFare || booking.fare?.totalFare || 0,
    };
  }

  // =====================================================
  // cancelBooking
  //
  // Purpose:
  // Cancels booking.
  //
  // Called By:
  // Frontend, internal services
  // =====================================================

  async cancelBooking(
    bookingId: string,
    reason?: string,
    cancelledBy?: "customer" | "driver" | "system",
  ): Promise<any> {
    const updateData: any = {
      status: "cancelled",
      cancelledAt: new Date(),
      searchCompleted: true,
    };

    if (reason) updateData.cancelReason = reason;
    if (cancelledBy) updateData.cancelledBy = cancelledBy;

    const booking = await RideBooking.findOneAndUpdate(
      { bookingId },
      { $set: updateData },
      { returnDocument: "after", runValidators: true },
    );

    if (!booking) {
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    return booking;
  }

  // =====================================================
  // updateBookingStatus
  //
  // Purpose:
  // Updates booking status.
  //
  // Called By:
  // Various services during ride lifecycle
  // =====================================================

  async updateBookingStatus(bookingId: string, status: string): Promise<any> {
    const validStatuses = [
      "searching",
      "accepted",
      "arrived",
      "pickupVerified",
      "inTransit",
      "dropVerified",
      "paymentPending",
      "completed",
      "cancelled",
      "no_driver_found",
    ];

    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const booking = await RideBooking.findOneAndUpdate(
      { bookingId },
      { $set: { status } },
      { returnDocument: "after", runValidators: true },
    );

    if (!booking) {
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    return booking;
  }

  private validateObjectId(
    id: string | mongoose.Types.ObjectId,
  ): mongoose.Types.ObjectId {
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    throw new Error(`Invalid ObjectId: ${String(id)}`);
  }

  private sanitizeUpdateData(data: IUpdateData): IUpdateData {
    const sanitized: IUpdateData = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue;

      if (key === "driverId" && value) {
        sanitized.driverId = this.validateObjectId(value);
      } else if (key === "customerId" && value) {
        sanitized.customerId = this.validateObjectId(value);
      } else {
        const k = key as keyof IUpdateData;
        (sanitized as any)[k] = value;
      }
    }

    return sanitized;
  }

  async getBookingsByCustomer(
    customerId: string | mongoose.Types.ObjectId,
  ): Promise<any[]> {
    const validatedId = this.validateObjectId(customerId);
    return RideBooking.find({ customerId: validatedId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async getBookingsByDriver(
    driverId: string | mongoose.Types.ObjectId,
  ): Promise<any[]> {
    const validatedId = this.validateObjectId(driverId);
    return RideBooking.find({ driverId: validatedId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async updatePaymentStatus(
    bookingId: string,
    paymentStatus: string,
  ): Promise<any> {
    const validStatuses = ["PENDING", "COMPLETED", "FAILED"];
    if (!validStatuses.includes(paymentStatus)) {
      throw new Error(`Invalid payment status: ${paymentStatus}`);
    }

    const booking = await RideBooking.findOneAndUpdate(
      { bookingId },
      { $set: { paymentStatus } },
      { returnDocument: "after", runValidators: true },
    );

    if (!booking) {
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    return booking;
  }
}
