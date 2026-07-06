// services/tizzyos/cab/rideDispatchService.ts

import mongoose from "mongoose";
import { EventEmitter } from "events";
import RideBooking from "../../../models/tizzyos/cab/rideBooking";
import RideDriverStatus from "../../../models/tizzyos/cab/rideDriverStatus";
import RideTracking from "../../../models/tizzyos/cab/rideTracking";
import { RideSearchService } from "./rideSearchService";
import { RideRequestService } from "./rideRequestService";
import { RideSocketService } from "../../../socket/tizzyos/cab/rideSocket";
import { RideFraudService } from "./rideFraudService";
import { RideBookingService } from "./rideBookingService";
import { generateQRCodeDataURI } from "../../../utils/tizzyos/cab/qrGenerator";
import { QRTokenService } from "../../../utils/tizzyos/cab/qrToken";
import { generateTrackingId } from "../../../utils/tizzyos/cab/idGenerator";

// =====================================================
// DISPATCH CONFIG - Can be moved to config file
// =====================================================
const DISPATCH_CONFIG = {
  MAX_BATCHES: 3,
  BATCH_INTERVAL: 20000, // 20 seconds
  DRIVER_RESPONSE_TIMEOUT: 20000, // 20 seconds
  MAX_DRIVERS_PER_BATCH: 5,
  RETRY_FARE_INCREMENT: 0.15, // 15%
  RADIUS_STEPS: [5, 10, 15, 20, 30, 50], // KM per batch
};

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
  originalFare?: number;
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

// =====================================================
// Redis Lock Service (Simplified - Add Redis implementation)
// =====================================================
class RedisLockService {
  private locks: Map<string, { timestamp: number }> = new Map();

  async acquireLock(key: string, ttlSeconds: number = 10): Promise<boolean> {
    const existing = this.locks.get(key);
    if (existing && Date.now() - existing.timestamp < ttlSeconds * 1000) {
      return false;
    }
    this.locks.set(key, { timestamp: Date.now() });
    return true;
  }

  async releaseLock(key: string): Promise<void> {
    this.locks.delete(key);
  }
}

export class RideDispatchService extends EventEmitter {
  private readonly searchService: RideSearchService;
  private readonly requestService: RideRequestService;
  private readonly socketService: RideSocketService;
  private readonly fraudService: RideFraudService;
  private readonly bookingService: RideBookingService;
  private readonly qrTokenService: QRTokenService;
  private readonly lockService: RedisLockService;
  private readonly dispatchIntervals: Map<string, NodeJS.Timeout>;
  private readonly responseTimeouts: Map<string, NodeJS.Timeout>;
  private readonly isRetryMode: Map<string, boolean>;
  private readonly activeRequests: Map<string, Set<string>>; // bookingId -> Set of requestIds
  private isCleaningUp: boolean;

  constructor() {
    super();
    this.searchService = new RideSearchService();
    this.requestService = new RideRequestService();
    this.socketService = RideSocketService.getInstance();
    this.fraudService = new RideFraudService();
    this.bookingService = new RideBookingService();
    this.qrTokenService = new QRTokenService();
    this.lockService = new RedisLockService();
    this.dispatchIntervals = new Map();
    this.responseTimeouts = new Map();
    this.isRetryMode = new Map();
    this.activeRequests = new Map();
    this.isCleaningUp = false;

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

  // =====================================================
  // startDispatch
  //
  // Purpose:
  // Starts driver dispatch for a booking.
  // Emits ride-search-started event.
  // Acquires Redis lock to prevent duplicate dispatch.
  //
  // Called By:
  // RideBookingService after booking creation
  // =====================================================

  async startDispatch(bookingId: string): Promise<void> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    if (this.isCleaningUp) {
      throw new Error("Service is cleaning up");
    }

    // Acquire lock to prevent duplicate dispatch
    const lockKey = `dispatch_lock:${bookingId}`;
    const locked = await this.lockService.acquireLock(lockKey, 30);
    if (!locked) {
      console.log(`Dispatch already running for booking: ${bookingId}`);
      return;
    }

    try {
      await this.stopDispatch(bookingId);

      const booking = await RideBooking.findOne({ bookingId });
      if (!booking) {
        throw new Error(`Booking not found: ${bookingId}`);
      }

      if (booking.status !== "searching") {
        throw new Error(`Booking ${bookingId} is not in searching state`);
      }

      const customerId = this.validateObjectId(booking.customerId);

      this.isRetryMode.set(bookingId, false);
      this.activeRequests.set(bookingId, new Set());

      booking.searchStartedAt = new Date();
      booking.searchCompleted = false;
      booking.currentBatch = 0;
      booking.driversFound = 0;
      await booking.save();

      this.socketService.emitToCustomer(
        customerId.toString(),
        "ride-search-started",
        {
          bookingId: booking.bookingId,
          message: "Searching for available drivers...",
          fare: booking.fare?.totalFare || 0,
          maxBatches: DISPATCH_CONFIG.MAX_BATCHES,
          batchInterval: DISPATCH_CONFIG.BATCH_INTERVAL,
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
      }, DISPATCH_CONFIG.BATCH_INTERVAL);

      this.dispatchIntervals.set(bookingId, interval);
      await this.processDispatchBatch(bookingId);
    } finally {
      await this.lockService.releaseLock(lockKey);
    }
  }

  // =====================================================
  // processDispatchBatch
  //
  // Purpose:
  // Processes one batch of drivers.
  // Maintains exactly MAX_DRIVERS_PER_BATCH active requests.
  // If a driver rejects, immediately sends to next driver.
  //
  // Called By:
  // Internal interval
  // =====================================================

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

      const currentBatch = booking.currentBatch;

      if (currentBatch >= DISPATCH_CONFIG.MAX_BATCHES) {
        booking.status = "no_driver_found";
        booking.searchCompleted = true;
        await booking.save({ session });

        const customerId = this.validateObjectId(booking.customerId);
        this.socketService.emitToCustomer(
          customerId.toString(),
          "no-driver-found",
          {
            bookingId: booking.bookingId,
            message: "No drivers available. Please try again.",
            canRetry: true,
            fare: booking.fare?.totalFare || 0,
          },
        );

        await this.stopDispatch(bookingId);
        await session.commitTransaction();
        return;
      }

      const radius = this.getRadiusForBatch(currentBatch);
      booking.searchRadius = radius;

      // Get active requests count for this booking
      const activeRequestIds = this.activeRequests.get(bookingId) || new Set();
      const activeCount = activeRequestIds.size;

      // Calculate how many more drivers we need to maintain MAX_DRIVERS_PER_BATCH
      const needed = DISPATCH_CONFIG.MAX_DRIVERS_PER_BATCH - activeCount;

      if (needed <= 0) {
        // Already have enough active requests
        await session.commitTransaction();
        return;
      }

      // Search for drivers
      const drivers = await this.searchService.findNearbyDrivers({
        latitude: booking.pickup.latitude,
        longitude: booking.pickup.longitude,
        radius: radius,
        limit: needed + 5, // Fetch extra to account for already notified
      });

      // Remove already notified drivers
      const existingRequests =
        await this.requestService.getRequestsByBooking(bookingId);
      const notifiedDriverIds = new Set(
        existingRequests.map((r: any) => r.driverId.toString()),
      );

      let availableDrivers = drivers.filter(
        (d) => !notifiedDriverIds.has(d.userId.toString()),
      );

      // Limit to needed count
      availableDrivers = availableDrivers.slice(0, needed);

      const customerId = this.validateObjectId(booking.customerId);
      const isRetry = this.isRetryMode.get(bookingId) || false;

      if (availableDrivers.length === 0) {
        // No new drivers found, but we still have active requests
        if (activeCount === 0) {
          // No active requests and no new drivers
          booking.currentBatch += 1;
          await booking.save({ session });

          this.socketService.emitToCustomer(
            customerId.toString(),
            "batch-completed",
            {
              bookingId: booking.bookingId,
              batchNumber: currentBatch + 1,
              driversFound: 0,
              message: `No drivers found within ${radius} KM`,
              nextBatchIn: DISPATCH_CONFIG.BATCH_INTERVAL / 1000,
            },
          );
        }
        await session.commitTransaction();
        return;
      }

      // Create ride requests
      const requests = await this.requestService.createBatchRequests(
        booking,
        availableDrivers,
        currentBatch,
        session,
      );

      booking.driversFound =
        (booking.driversFound || 0) + availableDrivers.length;
      await booking.save({ session });

      // Send requests to drivers
      for (const request of requests) {
        const driverStatus = await RideDriverStatus.findOne({
          userId: request.driverId,
        }).session(session);

        if (driverStatus && driverStatus.socketId) {
          const fare = booking.fare?.totalFare || 0;
          const originalFare = booking.originalFare || fare;

          // Add to active requests
          activeRequestIds.add(request._id.toString());

          this.socketService.emitToDriver(
            request.driverId.toString(),
            "new-ride-request",
            {
              requestId: request._id.toString(),
              bookingId: booking.bookingId,
              pickup: booking.pickup,
              destination: booking.destination,
              distance: booking.distance,
              fare: fare,
              originalFare: originalFare,
              isRetry: isRetry,
              batchNumber: currentBatch + 1,
              expiresAt: request.expiresAt,
            },
            driverStatus.socketId,
          );

          this.setDriverResponseTimeout(request._id.toString(), booking);
        }
      }

      this.activeRequests.set(bookingId, activeRequestIds);

      // Emit batch completed event
      this.socketService.emitToCustomer(
        customerId.toString(),
        "batch-completed",
        {
          bookingId: booking.bookingId,
          batchNumber: currentBatch + 1,
          driversFound: availableDrivers.length,
          message: `Sent requests to ${availableDrivers.length} drivers`,
          waitingForResponse: true,
          timeoutSeconds: DISPATCH_CONFIG.DRIVER_RESPONSE_TIMEOUT / 1000,
        },
      );

      // Only increment batch when we've sent all requests for this batch
      if (availableDrivers.length > 0) {
        booking.currentBatch += 1;
        await booking.save({ session });
      }

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

  // =====================================================
  // setDriverResponseTimeout
  //
  // Purpose:
  // Sets a timeout for driver response.
  // If driver doesn't respond, marks request as timeout.
  //
  // Called By:
  // processDispatchBatch
  // =====================================================

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

        // Remove from active requests
        const activeRequestIds = this.activeRequests.get(booking.bookingId);
        if (activeRequestIds) {
          activeRequestIds.delete(requestId);
        }

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

        // IMMEDIATELY send request to next driver
        this.replenishDriver(booking.bookingId);

        this.responseTimeouts.delete(requestId);
      } catch (error) {
        console.error(
          `Failed to process driver timeout for request ${requestId}:`,
          error,
        );
      }
    }, DISPATCH_CONFIG.DRIVER_RESPONSE_TIMEOUT);

    this.responseTimeouts.set(requestId, timeout);
  }

  // =====================================================
  // replenishDriver
  //
  // Purpose:
  // Immediately sends a request to the next available driver
  // when a driver rejects or times out.
  //
  // Called By:
  // handleDriverReject, setDriverResponseTimeout
  // =====================================================

  private async replenishDriver(bookingId: string): Promise<void> {
    try {
      const booking = await RideBooking.findOne({ bookingId });
      if (!booking || booking.status !== "searching") return;

      const activeRequestIds = this.activeRequests.get(bookingId) || new Set();
      const currentBatch = booking.currentBatch;

      const radius = this.getRadiusForBatch(currentBatch);

      // Get all already notified drivers
      const existingRequests =
        await this.requestService.getRequestsByBooking(bookingId);
      const notifiedDriverIds = new Set(
        existingRequests.map((r: any) => r.driverId.toString()),
      );

      // Search for one new driver
      const drivers = await this.searchService.findNearbyDrivers({
        latitude: booking.pickup.latitude,
        longitude: booking.pickup.longitude,
        radius: radius,
        limit: 5,
      });

      const availableDrivers = drivers.filter(
        (d) => !notifiedDriverIds.has(d.userId.toString()),
      );

      if (availableDrivers.length === 0) return;

      const driver = availableDrivers[0];

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const requests = await this.requestService.createBatchRequests(
          booking,
          [driver],
          currentBatch,
          session,
        );

        if (requests.length > 0) {
          const request = requests[0];
          const driverStatus = await RideDriverStatus.findOne({
            userId: request.driverId,
          }).session(session);

          if (driverStatus && driverStatus.socketId) {
            const fare = booking.fare?.totalFare || 0;
            const originalFare = booking.originalFare || fare;
            const isRetry = this.isRetryMode.get(bookingId) || false;

            activeRequestIds.add(request._id.toString());
            this.activeRequests.set(bookingId, activeRequestIds);

            this.socketService.emitToDriver(
              request.driverId.toString(),
              "new-ride-request",
              {
                requestId: request._id.toString(),
                bookingId: booking.bookingId,
                pickup: booking.pickup,
                destination: booking.destination,
                distance: booking.distance,
                fare: fare,
                originalFare: originalFare,
                isRetry: isRetry,
                batchNumber: currentBatch + 1,
                expiresAt: request.expiresAt,
              },
              driverStatus.socketId,
            );

            this.setDriverResponseTimeout(request._id.toString(), booking);
          }
        }

        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        console.error(`Error replenishing driver for ${bookingId}:`, error);
      } finally {
        await session.endSession();
      }
    } catch (error) {
      console.error(`Error in replenishDriver for ${bookingId}:`, error);
    }
  }

  private clearResponseTimeout(requestId: string): void {
    const timeout = this.responseTimeouts.get(requestId);
    if (timeout) {
      clearTimeout(timeout);
      this.responseTimeouts.delete(requestId);
    }
  }

  // =====================================================
  // retryDispatch
  //
  // Purpose:
  // Retries dispatch with increased fare.
  // Continues from current batch (does NOT restart).
  //
  // Called By:
  // Frontend (POST /api/ride/retry/:bookingId)
  // =====================================================

  async retryDispatch(bookingId: string): Promise<void> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    const booking = await RideBooking.findOne({ bookingId });
    if (!booking) {
      throw new Error(`Booking not found: ${bookingId}`);
    }

    if (booking.status !== "no_driver_found") {
      throw new Error(`Booking ${bookingId} is not in no_driver_found state`);
    }

    const currentFare = booking.fare?.totalFare || 0;
    const incrementPercentage = DISPATCH_CONFIG.RETRY_FARE_INCREMENT;
    const newFare = Math.round(currentFare * (1 + incrementPercentage));

    await this.bookingService.updateBookingForRetry(
      bookingId,
      newFare,
      incrementPercentage,
    );

    booking.status = "searching";
    booking.searchCompleted = false;
    await booking.save();

    this.isRetryMode.set(bookingId, true);

    const customerId = this.validateObjectId(booking.customerId);

    this.socketService.emitToCustomer(customerId.toString(), "retry-started", {
      bookingId: booking.bookingId,
      message: `Retrying with increased fare: ₹${newFare}`,
      oldFare: currentFare,
      newFare: newFare,
      incrementPercentage: incrementPercentage * 100,
      continuingFromBatch: booking.currentBatch + 1,
    });

    this.socketService.emitToCustomer(customerId.toString(), "fare-updated", {
      bookingId: booking.bookingId,
      fare: newFare,
      oldFare: currentFare,
      reason: "retry",
    });

    await this.startDispatch(bookingId);
  }

  // =====================================================
  // stopDispatch
  //
  // Purpose:
  // Stops all dispatch activity for a booking.
  // Cancels all pending requests.
  //
  // Called By:
  // Various services
  // =====================================================

  async stopDispatch(bookingId: string): Promise<void> {
    const interval = this.dispatchIntervals.get(bookingId);
    if (interval) {
      clearInterval(interval);
      this.dispatchIntervals.delete(bookingId);
    }

    // Clear all response timeouts
    const activeRequestIds = this.activeRequests.get(bookingId);
    if (activeRequestIds) {
      for (const requestId of activeRequestIds) {
        this.clearResponseTimeout(requestId);
      }
      this.activeRequests.delete(bookingId);
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

    this.isRetryMode.delete(bookingId);
  }

  // =====================================================
  // handleDriverAccept
  //
  // Purpose:
  // Handles driver accepting a ride request.
  // Stops dispatch, cancels all pending requests,
  // assigns driver, generates QR, starts tracking.
  // Uses atomic operations to prevent race conditions.
  //
  // Called By:
  // Socket handler when driver accepts
  // =====================================================

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

    // Acquire lock to prevent race condition
    const lockKey = `accept_lock:${bookingId}`;
    const locked = await this.lockService.acquireLock(lockKey, 30);
    if (!locked) {
      throw new Error("Another driver is already accepting this ride");
    }

    try {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        await this.stopDispatch(bookingId);

        const booking = await RideBooking.findOne({ bookingId }).session(
          session,
        );
        if (!booking) {
          throw new Error(`Booking not found: ${bookingId}`);
        }

        if (booking.status === "accepted" || booking.driverId) {
          throw new Error("Booking already accepted by another driver");
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

        // Clear active requests
        this.activeRequests.delete(bookingId);

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
            driverDetails: {
              name: "Driver",
              rating: 4.5,
              vehicleNumber: "KA-01-1234",
            },
          },
        );

        this.socketService.emitToDriver(driverId.toString(), "ride-accepted", {
          bookingId: booking.bookingId,
          trackingId: booking.trackingId,
          customerId: customerId.toString(),
          pickup: booking.pickup,
          destination: booking.destination,
          message: "You have accepted the ride",
          fare: booking.fare?.totalFare || 0,
        });

        this.socketService.emitToCustomer(
          customerId.toString(),
          "qr-generated",
          {
            bookingId: booking.bookingId,
            pickupQR: pickupQR,
            dropQR: dropQR,
            message: "QR codes generated for pickup and drop verification",
          },
        );

        this.socketService.emitToDriver(driverId.toString(), "qr-generated", {
          bookingId: booking.bookingId,
          pickupQR: pickupQR,
          dropQR: dropQR,
          message: "QR codes ready for verification",
        });

        this.socketService.emitToCustomer(
          customerId.toString(),
          "ride-status-change",
          {
            bookingId: booking.bookingId,
            status: "accepted",
            message: "Driver is on the way",
          },
        );

        this.socketService.emitToDriver(
          driverId.toString(),
          "ride-status-change",
          {
            bookingId: booking.bookingId,
            status: "accepted",
            message: "Ride accepted",
          },
        );

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
    } finally {
      await this.lockService.releaseLock(lockKey);
    }
  }

  // =====================================================
  // handleDriverReject
  //
  // Purpose:
  // Handles driver rejecting a ride request.
  // Immediately sends request to next driver.
  //
  // Called By:
  // Socket handler when driver rejects
  // =====================================================

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

      // Remove from active requests
      const activeRequestIds = this.activeRequests.get(bookingId);
      if (activeRequestIds) {
        activeRequestIds.delete(requestId);
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

        // IMMEDIATELY send request to next driver
        await this.replenishDriver(bookingId);
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

  private getRadiusForBatch(batchNumber: number): number {
    const index = Math.min(
      batchNumber,
      DISPATCH_CONFIG.RADIUS_STEPS.length - 1,
    );
    return DISPATCH_CONFIG.RADIUS_STEPS[index];
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

      this.isRetryMode.clear();
      this.activeRequests.clear();
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

  getIsRetryMode(bookingId: string): boolean {
    return this.isRetryMode.get(bookingId) || false;
  }
}
