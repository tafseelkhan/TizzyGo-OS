import mongoose from "mongoose";
import { EventEmitter } from "events";
import RideBooking from "../../../models/tizzyos/cab/rideBooking";
import RideDriverStatus from "../../../models/tizzyos/cab/rideDriverStatus";
import RideTracking from "../../../models/tizzyos/cab/rideTracking";
import { RideSearchService } from "./rideSearchService";
import { RideRequestService } from "./rideRequestService";
import { RideSocketService } from "../../../socket/tizzyos/cab/rideSocket";
import { RideFraudService } from "./rideFraudService";
import { generateQRCodeDataURI } from "../../../utils/tizzyos/cab/qrGenerator";
import { QRTokenService } from "../../../utils/tizzyos/cab/qrToken";
import { generateTrackingId } from "../../../utils/tizzyos/cab/idGenerator";

interface IBooking {
  _id: mongoose.Types.ObjectId;
  bookingId: string;
  customerId: mongoose.Types.ObjectId;
  driverId?: mongoose.Types.ObjectId;
  pickup: {
    latitude: number;
    longitude: number;
    address?: string;
    googlePlaceId?: string;
  };
  destination?: {
    latitude: number;
    longitude: number;
    address?: string;
    googlePlaceId?: string;
  };
  distance?: number;
  fare?: { totalFare?: number };
  rideCode: string;
  status: string;
  searchRadius: number;
  currentBatch: number;
  searchCompleted: boolean;
  trackingId?: string;
  qr?: { token: string; qrUrl: string };
  acceptedAt?: Date;
  [key: string]: any;
}

export class RideDispatchService extends EventEmitter {
  private readonly searchService: RideSearchService;
  private readonly requestService: RideRequestService;
  private readonly socketService: RideSocketService;
  private readonly fraudService: RideFraudService;
  private readonly qrTokenService: QRTokenService;
  private readonly dispatchIntervals: Map<string, NodeJS.Timeout>;
  private readonly responseTimeouts: Map<string, NodeJS.Timeout>;
  private readonly RADIUS_STEPS: readonly number[];
  private readonly BATCH_INTERVAL: number;
  private readonly DRIVER_RESPONSE_TIMEOUT: number;
  private readonly MAX_RADIUS: number;
  private readonly MAX_DRIVERS_PER_BATCH: number;
  private isCleaningUp: boolean;

  constructor() {
    super();
    this.searchService = new RideSearchService();
    this.requestService = new RideRequestService();
    this.socketService = RideSocketService.getInstance();
    this.fraudService = new RideFraudService();
    this.qrTokenService = new QRTokenService();
    this.dispatchIntervals = new Map();
    this.responseTimeouts = new Map();
    this.isCleaningUp = false;
    this.RADIUS_STEPS = [5, 10, 20, 30, 50, 75, 100];
    this.BATCH_INTERVAL = 30000;
    this.DRIVER_RESPONSE_TIMEOUT = 20000;
    this.MAX_RADIUS = 100;
    this.MAX_DRIVERS_PER_BATCH = 5;

    this.registerCleanupHandlers();
  }

  private registerCleanupHandlers(): void {
    const cleanup = async () => {
      await this.cleanup();
      process.exit(0);
    };

    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
  }

  async startDispatch(bookingId: string): Promise<void> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    if (this.isCleaningUp) {
      throw new Error("Service is cleaning up");
    }

    await this.stopDispatch(bookingId);

    const booking = await RideBooking.findOne({ bookingId });
    if (!booking) {
      throw new Error(`Booking not found: ${bookingId}`);
    }

    if (booking.status !== "searching") {
      throw new Error(`Booking ${bookingId} is not in searching state`);
    }

    const customerId = this.validateObjectId(booking.customerId);

    this.socketService.emitToCustomer(
      customerId.toString(),
      "ride-search-started",
      {
        bookingId: booking.bookingId,
        message: "Searching for available drivers...",
      },
    );

    const interval = setInterval(async () => {
      if (this.isCleaningUp) {
        clearInterval(interval);
        this.dispatchIntervals.delete(bookingId);
        return;
      }

      try {
        await this.processDispatchBatch(bookingId);
      } catch (error) {
        console.error(
          `Error processing dispatch batch for ${bookingId}:`,
          error,
        );
      }
    }, this.BATCH_INTERVAL);

    this.dispatchIntervals.set(bookingId, interval);
    await this.processDispatchBatch(bookingId);
  }

  private async processDispatchBatch(bookingId: string): Promise<void> {
    if (this.isCleaningUp) return;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const booking = await RideBooking.findOne({ bookingId }).session(session);
      if (!booking) {
        await this.stopDispatch(bookingId);
        await session.commitTransaction();
        return;
      }

      if (booking.status !== "searching" || booking.searchCompleted) {
        await this.stopDispatch(bookingId);
        await session.commitTransaction();
        return;
      }

      const currentRadius = this.getRadiusForBatch(booking.currentBatch);
      booking.searchRadius = currentRadius;

      if (currentRadius > this.MAX_RADIUS) {
        booking.status = "no_driver_found";
        booking.searchCompleted = true;
        await booking.save({ session });

        const customerId = this.validateObjectId(booking.customerId);
        this.socketService.emitToCustomer(
          customerId.toString(),
          "no-drivers-found",
          {
            bookingId: booking.bookingId,
            message:
              "No drivers available in your area. Please try again later.",
          },
        );

        await this.stopDispatch(bookingId);
        await session.commitTransaction();
        return;
      }

      const drivers = await this.searchService.findNearbyDrivers({
        latitude: booking.pickup.latitude,
        longitude: booking.pickup.longitude,
        radius: currentRadius,
        limit: this.MAX_DRIVERS_PER_BATCH,
      });

      if (drivers.length === 0) {
        booking.currentBatch += 1;
        await booking.save({ session });

        const customerId = this.validateObjectId(booking.customerId);
        this.socketService.emitToCustomer(
          customerId.toString(),
          "search-radius-expanded",
          {
            bookingId: booking.bookingId,
            radius: currentRadius,
            message: `Searching within ${currentRadius} KM radius...`,
          },
        );

        await session.commitTransaction();
        return;
      }

      const customerId = this.validateObjectId(booking.customerId);
      this.socketService.emitToCustomer(customerId.toString(), "driver-found", {
        bookingId: booking.bookingId,
        driverCount: drivers.length,
        radius: currentRadius,
        message: `${drivers.length} drivers found within ${currentRadius} KM`,
      });

      const requests = await this.requestService.createBatchRequests(
        booking,
        drivers,
        booking.currentBatch,
        session,
      );

      for (const request of requests) {
        const driverStatus = await RideDriverStatus.findOne({
          userId: request.driverId,
        }).session(session);

        if (driverStatus && driverStatus.socketId) {
          this.socketService.emitToDriver(
            request.driverId.toString(),
            "new-ride-request",
            {
              requestId: request._id.toString(),
              bookingId: booking.bookingId,
              pickup: booking.pickup,
              destination: booking.destination,
              distance: booking.distance,
              fare: booking.fare?.totalFare || 0,
              batchNumber: booking.currentBatch,
              expiresAt: request.expiresAt,
            },
            driverStatus.socketId,
          );

          this.socketService.emitToCustomer(
            customerId.toString(),
            "request-sent",
            {
              bookingId: booking.bookingId,
              driverId: request.driverId.toString(),
              driverName: `Driver ${request.driverId.toString().slice(0, 8)}`,
              message: `Request sent to driver ${request.driverId.toString().slice(0, 8)}`,
            },
          );

          this.setDriverResponseTimeout(request._id.toString(), booking);
        }
      }

      booking.currentBatch += 1;
      await booking.save({ session });
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      console.error(
        `Error in dispatch batch processing for ${bookingId}:`,
        error,
      );
    } finally {
      await session.endSession();
    }
  }

  private setDriverResponseTimeout(requestId: string, booking: IBooking): void {
    this.clearResponseTimeout(requestId);

    const timeout = setTimeout(async () => {
      if (this.isCleaningUp) return;

      try {
        const request = await this.requestService.getRequest(requestId);
        if (!request || request.status !== "pending") {
          this.responseTimeouts.delete(requestId);
          return;
        }

        await this.requestService.updateRequest(requestId, {
          status: "timeout",
          respondedAt: new Date(),
        });

        const driverId = this.validateObjectId(request.driverId);
        const rideId = this.validateObjectId(booking._id);

        await this.fraudService.recordDriverAction({
          userId: driverId,
          bookingId: booking.bookingId,
          rideId: rideId,
          action: "timeout",
          rideCode: booking.rideCode,
        });

        const customerId = this.validateObjectId(booking.customerId);
        this.socketService.emitToCustomer(
          customerId.toString(),
          "driver-timeout",
          {
            bookingId: booking.bookingId,
            driverId: request.driverId.toString(),
            message: "Driver did not respond in time",
          },
        );

        this.responseTimeouts.delete(requestId);
      } catch (error) {
        console.error(
          `Failed to process driver timeout for request ${requestId}:`,
          error,
        );
      }
    }, this.DRIVER_RESPONSE_TIMEOUT);

    this.responseTimeouts.set(requestId, timeout);
  }

  private clearResponseTimeout(requestId: string): void {
    const timeout = this.responseTimeouts.get(requestId);
    if (timeout) {
      clearTimeout(timeout);
      this.responseTimeouts.delete(requestId);
    }
  }

  private getRadiusForBatch(batchNumber: number): number {
    const index = Math.min(batchNumber, this.RADIUS_STEPS.length - 1);
    return this.RADIUS_STEPS[index];
  }

  async stopDispatch(bookingId: string): Promise<void> {
    const interval = this.dispatchIntervals.get(bookingId);
    if (interval) {
      clearInterval(interval);
      this.dispatchIntervals.delete(bookingId);
    }

    const booking = await RideBooking.findOne({ bookingId });
    if (booking) {
      const requests =
        await this.requestService.getRequestsByBooking(bookingId);
      for (const request of requests) {
        if (request.status === "pending") {
          this.clearResponseTimeout(request._id.toString());
        }
      }

      booking.searchCompleted = true;
      booking.searchExpiredAt = new Date();
      await booking.save();
    }
  }

  async handleDriverAccept(
    bookingId: string,
    requestId: string,
  ): Promise<void> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    if (!requestId || typeof requestId !== "string") {
      throw new Error("Invalid request ID");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await this.stopDispatch(bookingId);

      const booking = await RideBooking.findOne({ bookingId }).session(session);
      if (!booking) {
        throw new Error(`Booking not found: ${bookingId}`);
      }

      const request = await this.requestService.acceptRequest(
        requestId,
        session,
      );
      if (!request) {
        throw new Error(`Request not found: ${requestId}`);
      }

      const driverId = this.validateObjectId(request.driverId);
      const customerId = this.validateObjectId(booking.customerId);
      const rideId = this.validateObjectId(booking._id);

      booking.driverId = driverId;
      booking.status = "accepted";
      booking.acceptedAt = new Date();
      booking.searchCompleted = true;

      const trackingId = generateTrackingId();
      if (!trackingId) {
        throw new Error("Failed to generate tracking ID");
      }
      booking.trackingId = trackingId;

      await booking.save({ session });

      const tracking = new RideTracking({
        bookingId: booking.bookingId,
        trackingId: booking.trackingId,
        rideId: rideId,
        rideCode: booking.rideCode,
        customerId: customerId,
        driverId: driverId,
        location: {
          type: "Point",
          coordinates: [booking.pickup.longitude, booking.pickup.latitude],
          latitude: booking.pickup.latitude,
          longitude: booking.pickup.longitude,
          address: booking.pickup.address || "",
          googlePlaceId: booking.pickup.googlePlaceId || "",
        },
        distanceFromPickup: 0,
        distanceToDestination: booking.distance || 0,
        tripDistanceCovered: 0,
        tripDuration: 0,
        rideStatus: "accepted",
        pickupVerified: false,
        dropVerified: false,
        roadDistanceKm: booking.roadDistanceKm,
        trafficDurationMinutes: booking.trafficDurationMinutes,
        normalDurationMinutes: booking.normalDurationMinutes,
        encodedPolyline: booking.encodedPolyline,
        routeSummary: booking.routeSummary,
      });

      await tracking.save({ session });

      await RideDriverStatus.findOneAndUpdate(
        { userId: driverId },
        { $set: { isAvailable: false } },
        { session },
      );

      await this.requestService.cancelPendingRequests(
        bookingId,
        driverId,
        session,
      );

      const pickupToken = this.qrTokenService.generateQRToken({
        bookingId: booking.bookingId,
        trackingId: trackingId,
        rideId: rideId,
        customerId: customerId,
        driverId: driverId,
        type: "pickup",
      });

      const dropToken = this.qrTokenService.generateQRToken({
        bookingId: booking.bookingId,
        trackingId: trackingId,
        rideId: rideId,
        customerId: customerId,
        driverId: driverId,
        type: "drop",
      });

      const [pickupQR, dropQR] = await Promise.all([
        generateQRCodeDataURI(pickupToken),
        generateQRCodeDataURI(dropToken),
      ]);

      booking.qr = {
        token: pickupToken,
        qrUrl: pickupQR,
      };

      await booking.save({ session });
      await session.commitTransaction();

      this.socketService.emitToCustomer(
        customerId.toString(),
        "driver-accepted",
        {
          bookingId: booking.bookingId,
          trackingId: booking.trackingId,
          driverId: driverId.toString(),
          message: "Driver has accepted your ride request",
        },
      );

      this.socketService.emitToDriver(driverId.toString(), "ride-accepted", {
        bookingId: booking.bookingId,
        trackingId: booking.trackingId,
        customerId: customerId.toString(),
        pickup: booking.pickup,
        destination: booking.destination,
        message: "You have accepted the ride",
      });

      this.socketService.emitToCustomer(customerId.toString(), "qr-generated", {
        bookingId: booking.bookingId,
        pickupQR: pickupQR,
        dropQR: dropQR,
        message: "QR codes generated for pickup and drop verification",
      });

      this.socketService.emitToDriver(driverId.toString(), "qr-generated", {
        bookingId: booking.bookingId,
        pickupQR: pickupQR,
        dropQR: dropQR,
        message: "QR codes ready for verification",
      });

      this.emit("driver-accepted", {
        bookingId: booking.bookingId,
        driverId: driverId.toString(),
        customerId: customerId.toString(),
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async handleDriverReject(
    bookingId: string,
    requestId: string,
  ): Promise<void> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    if (!requestId || typeof requestId !== "string") {
      throw new Error("Invalid request ID");
    }

    try {
      const request = await this.requestService.updateRequest(requestId, {
        status: "rejected",
        respondedAt: new Date(),
      });

      if (!request) {
        throw new Error(`Request not found: ${requestId}`);
      }

      const booking = await RideBooking.findOne({ bookingId });
      if (booking) {
        const driverId = this.validateObjectId(request.driverId);
        const rideId = this.validateObjectId(booking._id);

        await this.fraudService.recordDriverAction({
          userId: driverId,
          bookingId: booking.bookingId,
          rideId: rideId,
          action: "rejected",
          rideCode: booking.rideCode,
        });

        const customerId = this.validateObjectId(booking.customerId);
        this.socketService.emitToCustomer(
          customerId.toString(),
          "driver-rejected",
          {
            bookingId: booking.bookingId,
            driverId: request.driverId.toString(),
            message: "Driver declined the request",
          },
        );
      }

      this.emit("driver-rejected", {
        bookingId: bookingId,
        requestId: requestId,
        driverId: request.driverId.toString(),
      });
    } catch (error) {
      console.error(`Error in handleDriverReject for ${bookingId}:`, error);
      throw error;
    }
  }

  private validateObjectId(
    id: string | mongoose.Types.ObjectId | any,
  ): mongoose.Types.ObjectId {
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (id && typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    throw new Error(`Invalid ObjectId: ${String(id)}`);
  }

  async cleanup(): Promise<void> {
    if (this.isCleaningUp) return;
    this.isCleaningUp = true;

    try {
      for (const [bookingId, interval] of this.dispatchIntervals) {
        clearInterval(interval);
        this.dispatchIntervals.delete(bookingId);
      }

      for (const [requestId, timeout] of this.responseTimeouts) {
        clearTimeout(timeout);
        this.responseTimeouts.delete(requestId);
      }
    } catch (error) {
      console.error("Error during cleanup:", error);
    } finally {
      this.isCleaningUp = false;
    }
  }

  getActiveDispatchCount(): number {
    return this.dispatchIntervals.size;
  }

  getActiveTimeoutCount(): number {
    return this.responseTimeouts.size;
  }
}
