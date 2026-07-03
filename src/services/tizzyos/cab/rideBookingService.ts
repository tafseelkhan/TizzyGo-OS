import mongoose from "mongoose";
import RideBooking from "../../../models/tizzyos/cab/rideBooking";
import { generateBookingId, generateRideCode } from "../../../utils/tizzyos/cab/idGenerator";
import { QRTokenService } from "../../../utils/tizzyos/cab/qrToken";
import { generateQRCodeDataURI } from "../../../utils/tizzyos/cab/qrGenerator";
import { GoogleRoutesService } from "../../../interfaces/route/GoogleRoutesService";
import { FareCalculationService } from "../../../interfaces/route/fare/FareCalculationService";

interface IBookingData {
  customerId: string | mongoose.Types.ObjectId;
  pickupLocation: {
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId: string;
  };
  dropLocation: {
    latitude: number;
    longitude: number;
    address: string;
    googlePlaceId: string;
  };
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

  async createBooking(bookingData: IBookingData): Promise<any> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const customerId = this.validateObjectId(bookingData.customerId);

      const route = await this.routeService.getRoute({
        origin: {
          latitude: bookingData.pickupLocation.latitude,
          longitude: bookingData.pickupLocation.longitude,
          address: bookingData.pickupLocation.address,
        },
        destination: {
          latitude: bookingData.dropLocation.latitude,
          longitude: bookingData.dropLocation.longitude,
          address: bookingData.dropLocation.address,
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      });

      const fareComponents = this.fareService.calculateFare({
        vehicle: bookingData.vehicle,
        roadDistanceKm: route.roadDistanceKm,
        trafficDurationMinutes: route.trafficDurationMinutes,
      });

      const booking = new RideBooking({
        bookingId: generateBookingId(),
        rideCode: generateRideCode(),
        customerId: customerId,
        driverId: null,
        vehicle: bookingData.vehicle,
        pickup: bookingData.pickupLocation,
        destination: bookingData.dropLocation,
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
          distanceFare: fareComponents.distanceFare,
          timeFare: fareComponents.timeFare,
          totalFare: fareComponents.totalFare,
        },
      });

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

  async refreshBookingRoute(
    bookingId: string,
    currentLocation: { latitude: number; longitude: number },
  ): Promise<any> {
    const booking = await RideBooking.findOne({ bookingId });
    if (!booking) {
      throw new Error(`Booking not found: ${bookingId}`);
    }

    const route = await this.routeService.refreshRoute({
      bookingId,
      currentLocation,
      forceRefresh: false,
    });

    if (route) {
      booking.roadDistanceKm = route.roadDistanceKm;
      booking.normalDurationMinutes = route.normalDurationMinutes;
      booking.trafficDurationMinutes = route.trafficDurationMinutes;
      booking.encodedPolyline = route.encodedPolyline;
      booking.routeSummary = route.routeSummary;
      booking.distance = route.roadDistanceKm;
      booking.duration = route.trafficDurationMinutes;

      booking.lastRouteRefreshAt = new Date();
      booking.lastRouteRefreshLocation = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      };

      await booking.save();
    }

    return booking;
  }

  async updateBooking(
    bookingId: string,
    updateData: IUpdateData,
  ): Promise<any> {
    const sanitizedData = this.sanitizeUpdateData(updateData);

    const booking = await RideBooking.findOneAndUpdate(
      { bookingId },
      { $set: sanitizedData },
      { new: true, runValidators: true },
    );

    if (!booking) {
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    return booking;
  }

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

  async getBookingByRideCode(rideCode: string): Promise<any> {
    if (!rideCode || typeof rideCode !== "string") {
      throw new Error("Invalid ride code");
    }

    const booking = await RideBooking.findOne({ rideCode }).lean();
    if (!booking) {
      throw new Error(`Booking not found with ride code: ${rideCode}`);
    }

    return booking;
  }

  async getBookingsByStatus(status: string): Promise<any[]> {
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

    return RideBooking.find({ status: status as any })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

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
      { new: true, runValidators: true },
    );

    if (!booking) {
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    return booking;
  }

  async verifyPickup(bookingId: string): Promise<any> {
    const booking = await RideBooking.findOneAndUpdate(
      { bookingId },
      { $set: { pickupVerified: true, pickupVerifiedAt: new Date() } },
      { new: true, runValidators: true },
    );

    if (!booking) {
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    return booking;
  }

  async verifyDrop(bookingId: string): Promise<any> {
    const booking = await RideBooking.findOneAndUpdate(
      { bookingId },
      { $set: { dropVerified: true, dropVerifiedAt: new Date() } },
      { new: true, runValidators: true },
    );

    if (!booking) {
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    return booking;
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
      { new: true, runValidators: true },
    );

    if (!booking) {
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    return booking;
  }

  async cancelBooking(
    bookingId: string,
    reason?: string,
    cancelledBy?: "customer" | "driver" | "system",
  ): Promise<any> {
    const updateData: any = {
      status: "cancelled",
      cancelledAt: new Date(),
    };

    if (reason) updateData.cancelReason = reason;
    if (cancelledBy) updateData.cancelledBy = cancelledBy;

    const booking = await RideBooking.findOneAndUpdate(
      { bookingId },
      { $set: updateData },
      { new: true, runValidators: true },
    );

    if (!booking) {
      throw new Error(`Booking not found with ID: ${bookingId}`);
    }

    return booking;
  }

  async searchBookings(
    query: Record<string, any>,
    options?: { limit?: number; skip?: number; sort?: Record<string, 1 | -1> },
  ): Promise<any[]> {
    const limit = options?.limit || 10;
    const skip = options?.skip || 0;
    const sort = options?.sort || { createdAt: -1 };

    const sanitizedQuery = this.sanitizeQuery(query);
    return RideBooking.find(sanitizedQuery)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
  }

  async countBookings(query: Record<string, any>): Promise<number> {
    const sanitizedQuery = this.sanitizeQuery(query);
    return RideBooking.countDocuments(sanitizedQuery).exec();
  }

  async getBookingCountByStatus(status: string): Promise<number> {
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

    return RideBooking.countDocuments({ status: status as any }).exec();
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
        // assign with proper key typing
        (sanitized as any)[k] = value;
      }
    }

    return sanitized;
  }

  private sanitizeQuery(query: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;

      if (key === "customerId" || key === "driverId") {
        sanitized[key] = this.validateObjectId(value);
      } else if (key === "bookingId" || key === "rideCode") {
        if (typeof value === "string" && value.trim().length > 0) {
          sanitized[key] = value.trim();
        }
      } else if (typeof value === "string") {
        sanitized[key] = value.trim();
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
