// services/tizzyos/cab/rideBookingService.ts

import mongoose from "mongoose";
import RideBooking from "../../../models/tizzyos/cab/rideBooking";
import RideQuote from "../../../models/tizzyos/cab/rideQuote";
import AirportQuote from "../../../models/tizzyos/cab/airportQuote"; // ✅ NEW: Import AirportQuote
import {
  generateBookingId,
  generateRideCode,
  generateQuoteCode,
  generateLocalRideFwsId,
  generateAirportFwsId,
} from "../../../utils/tizzyos/cab/idGenerator";
import { QRTokenService } from "../../../utils/tizzyos/cab/qrToken";
import { generateQRCodeDataURI } from "../../../utils/tizzyos/cab/qrGenerator";
import RideDriver from "../../../models/tizzyos/cab/rideDriver";
import User from "../../../models/tizzygo/auths/User";
import { GoogleRoutesService } from "../../../interfaces/route/GoogleRoutesService";
import { FareCalculationService } from "../../../interfaces/route/fare/FareCalculationService";
import { RideDispatchService } from "../../../services/tizzyos/cab/rideDispatchService";

interface IBookingData {
  customerId: string | mongoose.Types.ObjectId;
  quoteId: string; // Quote ID from database
  serviceType: "LOCAL_RIDE" | "AIRPORT";
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

// ✅ NEW: Common quote interface for type safety
interface INormalizedQuote {
  quoteId: string;
  totalFare: number;
  vehicle: {
    categoryCode: string;
    companyCode: string;
    modelCode: string;
    vehicleType: string;
    class: string;
    baseFare: number;
    classFare: number;
    maxPassengers: number;
  };
  pickup: {
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId: string;
  };
  drop: {
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId: string;
  };
  routeData: {
    roadDistanceKm: number;
    normalDurationMinutes: number;
    trafficDurationMinutes: number;
    encodedPolyline: string;
    routeSummary: {
      startAddress: string;
      endAddress: string;
      durationText: string;
      distanceText: string;
      steps: Array<{
        distance: number;
        duration: number;
        instruction: string;
        polyline: string;
        travelMode: string;
        maneuver: string;
      }>;
    };
  };
  fareComponents: {
    baseFare: number;
    classFare: number;
    distanceFare: number;
    timeFare: number;
    platformFees: number;
    subTotal: number;
    gstFare: number;
    totalFare: number;
    gstPercentage: number;
    perKmRate: number;
    perMinuteRate: number;
  };
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
  // ✅ FIXED: Now supports both LOCAL_RIDE and AIRPORT quotes
  // =====================================================

  async createBooking(bookingData: IBookingData): Promise<any> {
    console.log("=========================================");
    console.log("📝 CREATE BOOKING STARTED");
    console.log("=========================================");
    console.log("📋 Booking Data:", {
      customerId: bookingData.customerId,
      quoteId: bookingData.quoteId,
      serviceType: bookingData.serviceType,
      paymentMethod: bookingData.paymentMethod,
    });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const customerId = this.validateObjectId(bookingData.customerId);
      console.log("✅ Customer ID validated:", customerId);

      const serviceType = bookingData.serviceType || "LOCAL_RIDE";

      // ============================================================
      // ✅ STEP 1: Fetch quote from correct model based on serviceType
      // ============================================================
      let quote: INormalizedQuote | null = null;
      let quoteModelName = "";

      if (serviceType === "LOCAL_RIDE") {
        console.log(
          `🔍 Fetching LOCAL_RIDE quote from RideQuote: ${bookingData.quoteId}`,
        );
        const localQuote = await RideQuote.findOne({
          quoteId: bookingData.quoteId,
          expiresAt: { $gt: new Date() },
          isUsed: false,
        }).session(session);

        if (localQuote) {
          console.log(`✅ LOCAL_RIDE quote found: ${localQuote.quoteId}`);
          quoteModelName = "RideQuote";
          // ✅ Normalize LOCAL_RIDE quote to common structure
          quote = {
            quoteId: localQuote.quoteId,
            totalFare: localQuote.totalFare,
            vehicle: localQuote.vehicle,
            pickup: localQuote.pickup,
            drop: localQuote.drop,
            routeData: localQuote.routeData,
            fareComponents: localQuote.fareComponents,
          };
          // Mark as used
          localQuote.isUsed = true;
          await localQuote.save({ session });
        } else {
          console.log(
            `❌ LOCAL_RIDE quote not found or expired: ${bookingData.quoteId}`,
          );
        }
      } else if (serviceType === "AIRPORT") {
        console.log(
          `🔍 Fetching AIRPORT quote from AirportQuote: ${bookingData.quoteId}`,
        );
        const airportQuote = await AirportQuote.findOne({
          quoteId: bookingData.quoteId,
          expiresAt: { $gt: new Date() },
          isUsed: false,
        }).session(session);

        if (airportQuote) {
          console.log(`✅ AIRPORT quote found: ${airportQuote.quoteId}`);
          quoteModelName = "AirportQuote";
          // ✅ Normalize AIRPORT quote to common structure
          quote = {
            quoteId: airportQuote.quoteId,
            totalFare: airportQuote.totalFare,
            vehicle: airportQuote.vehicle,
            pickup: airportQuote.pickup,
            drop: airportQuote.drop,
            routeData: airportQuote.routeData,
            fareComponents: airportQuote.fareComponents,
          };
          // Mark as used
          airportQuote.isUsed = true;
          airportQuote.usedAt = new Date();
          await airportQuote.save({ session });
        } else {
          console.log(
            `❌ AIRPORT quote not found or expired: ${bookingData.quoteId}`,
          );
        }
      } else {
        throw new Error(`Invalid service type: ${serviceType}`);
      }

      if (!quote) {
        throw new Error("Invalid or expired quote. Please get a new quote.");
      }

      console.log(`✅ Quote found from ${quoteModelName}:`, {
        quoteId: quote.quoteId,
        totalFare: quote.totalFare,
        vehicleType: quote.vehicle.vehicleType,
      });

      // ============================================================
      // ✅ STEP 2: Use normalized quote data
      // ============================================================
      const route = quote.routeData;
      console.log("🗺️ Route data from quote:", {
        roadDistanceKm: route.roadDistanceKm,
        trafficDurationMinutes: route.trafficDurationMinutes,
        hasPolyline: !!route.encodedPolyline,
      });

      const fareComponents = quote.fareComponents;
      const lockedFare = quote.totalFare;
      console.log("💰 Locked fare from quote:", {
        totalFare: lockedFare,
        baseFare: fareComponents.baseFare,
        distanceFare: fareComponents.distanceFare,
        timeFare: fareComponents.timeFare,
        gstFare: fareComponents.gstFare,
      });

      // Generate FWS IDs based on service type
      const fwsLocalRideId =
        serviceType === "LOCAL_RIDE" ? generateLocalRideFwsId() : undefined;
      const fwsAirportRideId =
        serviceType === "AIRPORT" ? generateAirportFwsId() : undefined;

      // ============================================================
      // ✅ STEP 3: Create common RideBooking
      // ============================================================
      const booking = new RideBooking({
        bookingId: generateBookingId(),
        rideCode: generateRideCode(),
        serviceType: serviceType,
        quoteId: quote.quoteId,
        fwsLocalRideId: fwsLocalRideId,
        fwsAirportRideId: fwsAirportRideId,
        customerId: customerId,
        driverId: null, // Will be assigned during dispatch
        vehicle: quote.vehicle,
        pickup: quote.pickup,
        destination: quote.drop,
        paymentMethod: bookingData.paymentMethod || "COC",
        paymentStatus: "PENDING",
        status: "searching",
        searchRadius: serviceType === "LOCAL_RIDE" ? 5 : 20,
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
      });

      console.log("📦 Booking object created:", {
        bookingId: booking.bookingId,
        rideCode: booking.rideCode,
        serviceType: booking.serviceType,
        quoteId: booking.quoteId,
        fwsLocalRideId: booking.fwsLocalRideId,
        fwsAirportRideId: booking.fwsAirportRideId,
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

      await booking.save({ session });
      await session.commitTransaction();
      console.log("✅ Transaction committed");
      console.log("=========================================");
      console.log("📤 BOOKING CREATED SUCCESSFULLY");
      console.log("=========================================");
      console.log(`   Booking ID: ${booking.bookingId}`);
      console.log(`   Service Type: ${booking.serviceType}`);
      console.log(`   Quote Model: ${quoteModelName}`);
      console.log(`   Quote ID: ${booking.quoteId}`);
      console.log(`   FWS Local ID: ${booking.fwsLocalRideId || "N/A"}`);
      console.log(`   FWS Airport ID: ${booking.fwsAirportRideId || "N/A"}`);
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
  // src/services/RideBookingService.ts

  async getEnrichedBooking(bookingId: string): Promise<any> {
    console.log("=========================================");
    console.log("🔍 GET ENRICHED BOOKING");
    console.log("=========================================");
    console.log(`   Booking ID: ${bookingId}`);

    if (!bookingId || typeof bookingId !== "string") {
      console.log("❌ Invalid booking ID");
      throw new Error("Invalid booking ID");
    }

    // 1️⃣ Get booking
    const booking = await RideBooking.findOne({ bookingId }).lean();
    if (!booking) {
      console.log("❌ Booking not found:", bookingId);
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    console.log("✅ Booking found:", {
      bookingId: booking.bookingId,
      customerId: booking.customerId,
      driverId: booking.driverId,
    });

    // 2️⃣ Get Customer Details from User model
    let customerDetails = null;
    if (booking.customerId) {
      customerDetails = await User.findById(booking.customerId)
        .select("name email phone image roles")
        .lean();

      console.log("✅ Customer found:", {
        name: customerDetails?.name,
        phone: customerDetails?.phone,
      });
    }

    // 3️⃣ Get Driver Details from User + RideDriver models
    let driverDetails = null;
    if (booking.driverId) {
      // First get user details
      const driverUser = await User.findById(booking.driverId)
        .select("name email phone image roles")
        .lean();

      if (driverUser) {
        // Then get RideDriver profile
        const rideDriver = await RideDriver.findOne({
          userId: booking.driverId,
        }).lean();

        driverDetails = {
          ...driverUser,
          driverProfile: rideDriver || null,
        };

        console.log("✅ Driver found:", {
          name: driverUser.name,
          phone: driverUser.phone,
          hasVehicle: !!rideDriver,
          vehicleNumber: rideDriver?.vehicle?.vehicleNumber,
        });
      }
    }

    console.log("=========================================");

    // 4️⃣ Return enriched response
    return {
      ...booking,
      customer: customerDetails,
      driver: driverDetails,
    };
  }

  // ✅ Keep old method for backward compatibility
  async getBooking(bookingId: string): Promise<any> {
    console.log("=========================================");
    console.log("🔍 GET BOOKING (Legacy)");
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
      serviceType: booking.serviceType,
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
      serviceType: booking.serviceType,
      quoteId: booking.quoteId,
      fwsLocalRideId: booking.fwsLocalRideId,
      fwsAirportRideId: booking.fwsAirportRideId,
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
