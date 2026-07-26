// services/tizzyos/cab/rideBookingService.ts

import mongoose from "mongoose";
import RideBooking from "../../../models/tizzyos/cab/rideBooking";
import RideQuote from "../../../models/tizzyos/cab/rideQuote";
import {
  generateBookingId,
  generateRideCode,
  generateQuoteCode,
} from "../../../utils/tizzyos/cab/idGenerator";
import { QRTokenService } from "../../../utils/tizzyos/cab/qrToken";
import { generateQRCodeDataURI } from "../../../utils/tizzyos/cab/qrGenerator";
import { GoogleRoutesService } from "../../../interfaces/route/GoogleRoutesService";
import { FareCalculationService } from "../../../interfaces/route/fare/FareCalculationService";
import { RideDispatchService } from "../../../services/tizzyos/cab/rideDispatchService";

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
    console.log("=========================================");
    console.log("📝 CREATE BOOKING STARTED");
    console.log("=========================================");
    console.log("📋 Booking Data:", {
      customerId: bookingData.customerId,
      quoteId: bookingData.quoteId,
      paymentMethod: bookingData.paymentMethod,
    });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const customerId = this.validateObjectId(bookingData.customerId);
      console.log("✅ Customer ID validated:", customerId);

      // Get quote from database
      console.log("🔍 Fetching quote from database:", bookingData.quoteId);
      const quote = await RideQuote.findOne({
        quoteId: bookingData.quoteId,
        expiresAt: { $gt: new Date() },
        isUsed: false,
      }).session(session);

      if (!quote) {
        console.log("❌ Quote not found or expired:", bookingData.quoteId);
        throw new Error("Invalid or expired quote. Please get a new quote.");
      }
      console.log("✅ Quote found:", {
        quoteId: quote.quoteId,
        totalFare: quote.totalFare,
        rideType: quote.vehicle.vehicleType,
      });

      // Mark quote as used
      quote.isUsed = true;
      await quote.save({ session });
      console.log("✅ Quote marked as used");

      // Use route data from quote (NO Google Routes API call)
      const route = quote.routeData;
      console.log("🗺️ Route data from quote:", {
        roadDistanceKm: route.roadDistanceKm,
        trafficDurationMinutes: route.trafficDurationMinutes,
        hasPolyline: !!route.encodedPolyline,
      });

      // Use fare from quote (NO recalculation needed)
      const fareComponents = quote.fareComponents;
      const lockedFare = quote.totalFare;
      console.log("💰 Locked fare from quote:", {
        totalFare: lockedFare,
        baseFare: fareComponents.baseFare,
        distanceFare: fareComponents.distanceFare,
        timeFare: fareComponents.timeFare,
        gstFare: fareComponents.gstFare,
      });

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

      console.log("📦 Booking object created:", {
        bookingId: booking.bookingId,
        rideCode: booking.rideCode,
        status: booking.status,
        totalFare: booking.fare.totalFare,
      });

      // Generate QR token (will be regenerated after driver accepts)
      console.log("🔐 Generating QR token...");
      const qrToken = this.qrTokenService.generateQRToken({
        bookingId: booking.bookingId,
        trackingId: "",
        rideId: booking._id as mongoose.Types.ObjectId,
        customerId: customerId,
        driverId: new mongoose.Types.ObjectId(),
        type: "pickup",
      });
      console.log("✅ QR token generated");

      const qrDataURI = await generateQRCodeDataURI(qrToken);
      console.log("✅ QR code generated");

      booking.qr = {
        token: qrToken,
        qrUrl: qrDataURI,
      };

      await booking.save({ session });
      await session.commitTransaction();
      console.log("✅ Transaction committed");
      console.log("=========================================");
      console.log("📤 BOOKING CREATED SUCCESSFULLY");
      console.log("=========================================");
      console.log(`   Booking ID: ${booking.bookingId}`);
      console.log(`   Ride Code: ${booking.rideCode}`);
      console.log(`   Total Fare: ₹${booking.fare.totalFare}`);
      console.log(`   Status: ${booking.status}`);
      console.log("=========================================");

      // ✅ THEN START DISPATCH (AFTER COMMIT)
      const dispatchService = new RideDispatchService();
      // ✅ Don't await - fire and forget, or handle error separately
      dispatchService.startDispatch(booking.bookingId).catch((error) => {
        console.error(`❌ Dispatch failed for ${booking.bookingId}:`, error);
      });

      return booking;
    } catch (error) {
      await session.abortTransaction();
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.log("❌ Booking creation failed:", errorMessage);
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
    console.log("=========================================");
    console.log("🔄 UPDATE BOOKING FOR RETRY");
    console.log("=========================================");
    console.log(`   Booking ID: ${bookingId}`);
    console.log(`   New Fare: ₹${newFare}`);
    console.log(`   Increment: ${incrementPercentage}%`);

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
      console.log("❌ Booking not found:", bookingId);
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    console.log("✅ Booking updated for retry:", {
      bookingId: booking.bookingId,
      newFare: booking.fare.totalFare,
      retryAttempts: booking.retryAttempts || 1,
    });
    console.log("=========================================");

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
    console.log("=========================================");
    console.log("🔄 UPDATE BOOKING");
    console.log("=========================================");
    console.log(`   Booking ID: ${bookingId}`);
    console.log("   Update Data:", updateData);

    const sanitizedData = this.sanitizeUpdateData(updateData);

    const booking = await RideBooking.findOneAndUpdate(
      { bookingId },
      { $set: sanitizedData },
      { returnDocument: "after", runValidators: true },
    );

    if (!booking) {
      console.log("❌ Booking not found:", bookingId);
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    console.log("✅ Booking updated:", {
      bookingId: booking.bookingId,
      status: booking.status,
      updatedFields: Object.keys(sanitizedData),
    });
    console.log("=========================================");

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
    console.log("=========================================");
    console.log("🔍 GET BOOKING");
    console.log("=========================================");
    console.log(`   Booking ID: ${bookingId}`);

    if (!bookingId || typeof bookingId !== "string") {
      console.log("❌ Invalid booking ID");
      throw new Error("Invalid booking ID");
    }

    const booking = await RideBooking.findOne({ bookingId }).lean();
    if (!booking) {
      console.log("❌ Booking not found:", bookingId);
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    console.log("✅ Booking found:", {
      bookingId: booking.bookingId,
      status: booking.status,
      fare: booking.fare?.totalFare,
    });
    console.log("=========================================");

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
    console.log("=========================================");
    console.log("🔍 GET BOOKING STATUS");
    console.log("=========================================");
    console.log(`   Booking ID: ${bookingId}`);

    const booking = await this.getBooking(bookingId);

    const statusResponse = {
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

    console.log("✅ Status response:", statusResponse);
    console.log("=========================================");

    return statusResponse;
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
    console.log("=========================================");
    console.log("❌ CANCEL BOOKING");
    console.log("=========================================");
    console.log(`   Booking ID: ${bookingId}`);
    console.log(`   Reason: ${reason || "No reason provided"}`);
    console.log(`   Cancelled By: ${cancelledBy || "system"}`);

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
      console.log("❌ Booking not found:", bookingId);
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    console.log("✅ Booking cancelled:", {
      bookingId: booking.bookingId,
      status: booking.status,
      cancelledAt: booking.cancelledAt,
    });
    console.log("=========================================");

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
    console.log("=========================================");
    console.log("📊 UPDATE BOOKING STATUS");
    console.log("=========================================");
    console.log(`   Booking ID: ${bookingId}`);
    console.log(`   New Status: ${status}`);

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
      console.log("❌ Invalid status:", status);
      throw new Error(`Invalid status: ${status}`);
    }

    const booking = await RideBooking.findOneAndUpdate(
      { bookingId },
      { $set: { status } },
      { returnDocument: "after", runValidators: true },
    );

    if (!booking) {
      console.log("❌ Booking not found:", bookingId);
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    console.log("✅ Status updated:", {
      bookingId: booking.bookingId,
      oldStatus: booking.status,
      newStatus: status,
    });
    console.log("=========================================");

    return booking;
  }

  private validateObjectId(
    id: string | mongoose.Types.ObjectId,
  ): mongoose.Types.ObjectId {
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    console.log("❌ Invalid ObjectId:", id);
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
    console.log("=========================================");
    console.log("🔍 GET BOOKINGS BY CUSTOMER");
    console.log("=========================================");
    console.log(`   Customer ID: ${customerId}`);

    const validatedId = this.validateObjectId(customerId);
    const bookings = await RideBooking.find({ customerId: validatedId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    console.log(`✅ Found ${bookings.length} bookings for customer`);
    console.log("=========================================");

    return bookings;
  }

  async getBookingsByDriver(
    driverId: string | mongoose.Types.ObjectId,
  ): Promise<any[]> {
    console.log("=========================================");
    console.log("🔍 GET BOOKINGS BY DRIVER");
    console.log("=========================================");
    console.log(`   Driver ID: ${driverId}`);

    const validatedId = this.validateObjectId(driverId);
    const bookings = await RideBooking.find({ driverId: validatedId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    console.log(`✅ Found ${bookings.length} bookings for driver`);
    console.log("=========================================");

    return bookings;
  }

  async updatePaymentStatus(
    bookingId: string,
    paymentStatus: string,
  ): Promise<any> {
    console.log("=========================================");
    console.log("💳 UPDATE PAYMENT STATUS");
    console.log("=========================================");
    console.log(`   Booking ID: ${bookingId}`);
    console.log(`   Payment Status: ${paymentStatus}`);

    const validStatuses = ["PENDING", "COMPLETED", "FAILED"];
    if (!validStatuses.includes(paymentStatus)) {
      console.log("❌ Invalid payment status:", paymentStatus);
      throw new Error(`Invalid payment status: ${paymentStatus}`);
    }

    const booking = await RideBooking.findOneAndUpdate(
      { bookingId },
      { $set: { paymentStatus } },
      { returnDocument: "after", runValidators: true },
    );

    if (!booking) {
      console.log("❌ Booking not found:", bookingId);
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    console.log("✅ Payment status updated:", {
      bookingId: booking.bookingId,
      paymentStatus: booking.paymentStatus,
    });
    console.log("=========================================");

    return booking;
  }
}
