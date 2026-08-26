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
// ✅ Import User model for customer details
import User from "../../../models/tizzygo/auths/User";

// =====================================================
// DISPATCH CONFIG
// =====================================================
const DISPATCH_CONFIG = {
  MAX_BATCHES: 3,
  BATCH_INTERVAL: 20000,
  DRIVER_RESPONSE_TIMEOUT: 20000,
  MAX_DRIVERS_PER_BATCH: 5,
  RETRY_FARE_INCREMENT: 0.15,
  RADIUS_STEPS: [10, 15, 20, 25, 30, 50],
  MAX_RETRY_ATTEMPTS: 10,
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
  retryFare?: number;
  retryAttempts?: number;
  lastFareIncrementPercentage?: number;
  retryHistory?: Array<{
    attemptNumber: number;
    oldFare: number;
    newFare: number;
    incrementPercentage: number;
    batchStartedFrom: number;
    timestamp: Date;
    radius: number;
    status: "started" | "completed" | "failed";
    driversFound?: number;
    completedAt?: Date;
  }>;
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
  private readonly activeRequests: Map<string, Set<string>>;
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

  async startDispatch(bookingId: string): Promise<void> {
    console.log(`========================================`);
    console.log(`🚀 [START DISPATCH] Booking: ${bookingId}`);
    console.log(`========================================`);

    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    if (this.isCleaningUp) {
      throw new Error("Service is cleaning up");
    }

    const lockKey = `dispatch_lock:${bookingId}`;
    const locked = await this.lockService.acquireLock(lockKey, 30);
    if (!locked) {
      console.log(`⚠️ [START DISPATCH] Already running for: ${bookingId}`);
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

      console.log(`✅ [START DISPATCH] Booking ${bookingId} initialized`);
      console.log(`   Fare: ₹${booking.fare?.totalFare || 0}`);
      console.log(`   Max Batches: ${DISPATCH_CONFIG.MAX_BATCHES}`);

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
            `❌ Error processing dispatch batch for ${bookingId}:`,
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

  private async processDispatchBatch(bookingId: string): Promise<void> {
    console.log(`========================================`);
    console.log(`📦 [DISPATCH BATCH] Booking: ${bookingId}`);
    console.log(`========================================`);

    if (this.isCleaningUp) return;

    let retries = 3;

    while (retries > 0) {
      const session = await mongoose.startSession();
      session.startTransaction();
      let committed = false;

      try {
        const booking = await RideBooking.findOne({ bookingId }).session(
          session,
        );
        if (!booking) {
          console.log(`❌ [DISPATCH BATCH] Booking not found: ${bookingId}`);
          await this.stopDispatch(bookingId);
          await session.commitTransaction();
          committed = true;
          session.endSession();
          return;
        }

        if (booking.status !== "searching" || booking.searchCompleted) {
          console.log(`⚠️ [DISPATCH BATCH] Booking not searching, stopping...`);
          await this.stopDispatch(bookingId);
          await session.commitTransaction();
          committed = true;
          session.endSession();
          return;
        }

        const currentBatch = booking.currentBatch;

        console.log(`📊 [DISPATCH BATCH] Booking Status: ${booking.status}`);
        console.log(`📊 [DISPATCH BATCH] Current Batch: ${currentBatch}`);
        console.log(
          `📊 [DISPATCH BATCH] Max Batches: ${DISPATCH_CONFIG.MAX_BATCHES}`,
        );
        console.log(
          `📊 [DISPATCH BATCH] Retry Mode: ${this.isRetryMode.get(bookingId) || false}`,
        );

        // ✅ CHECK IF MAX BATCHES REACHED
        if (currentBatch >= DISPATCH_CONFIG.MAX_BATCHES) {
          console.log(
            `❌ [DISPATCH BATCH] MAX BATCHES REACHED! (${currentBatch} >= ${DISPATCH_CONFIG.MAX_BATCHES})`,
          );
          console.log(
            `📊 [DISPATCH BATCH] Total drivers found: ${booking.driversFound || 0}`,
          );

          // ✅ Update retry history if in retry mode
          if (
            this.isRetryMode.get(bookingId) &&
            booking.retryHistory &&
            booking.retryHistory.length > 0
          ) {
            const lastRetry =
              booking.retryHistory[booking.retryHistory.length - 1];
            if (lastRetry && lastRetry.status === "started") {
              lastRetry.status = "completed";
              lastRetry.completedAt = new Date();
              lastRetry.driversFound = booking.driversFound || 0;
              console.log(`✅ [RETRY] Retry history updated:`, lastRetry);
            }
          }

          // ✅ Set status to no_driver_found
          booking.status = "no_driver_found";
          booking.searchCompleted = true;
          await booking.save({ session });

          await session.commitTransaction();
          committed = true;
          session.endSession();

          console.log(`✅ [DISPATCH BATCH] Status updated to no_driver_found`);

          const customerId = this.validateObjectId(booking.customerId);

          // ✅ Emit no-driver-found with fare details + retry history
          this.socketService.emitToCustomer(
            customerId.toString(),
            "no-driver-found",
            {
              bookingId: booking.bookingId,
              message: "No drivers available. Please try again.",
              canRetry: true,
              fare: booking.fare?.totalFare || 0,
              originalFare:
                booking.originalFare || booking.fare?.totalFare || 0,
              batchesCompleted: currentBatch,
              driversFound: booking.driversFound || 0,
              retryAttempts: booking.retryAttempts || 0,
              retryHistory: booking.retryHistory || [],
            },
          );

          console.log(`📤 [DISPATCH BATCH] Emitted no-driver-found event`);
          console.log(
            `📤 [DISPATCH BATCH] Fare: ₹${booking.fare?.totalFare || 0}`,
          );

          await this.stopDispatch(bookingId);

          console.log(`========================================`);
          console.log(`❌ [DISPATCH BATCH] COMPLETE - NO DRIVER FOUND`);
          console.log(`========================================`);
          return;
        }

        // ✅ Calculate radius for current batch
        const radius = this.getRadiusForBatch(currentBatch);
        booking.searchRadius = radius;
        console.log(
          `📍 [DISPATCH BATCH] Radius for batch ${currentBatch + 1}: ${radius} KM`,
        );

        const activeRequestIds =
          this.activeRequests.get(bookingId) || new Set();
        const activeCount = activeRequestIds.size;
        const needed = DISPATCH_CONFIG.MAX_DRIVERS_PER_BATCH - activeCount;

        console.log(`📊 [DISPATCH BATCH] Active requests: ${activeCount}`);
        console.log(`📊 [DISPATCH BATCH] Needed drivers: ${needed}`);

        if (needed <= 0) {
          console.log(
            `✅ [DISPATCH BATCH] Already have ${activeCount} active requests, waiting...`,
          );
          await session.commitTransaction();
          committed = true;
          session.endSession();
          return;
        }

        const drivers = await this.searchService.findNearbyDrivers({
          latitude: booking.pickup.latitude,
          longitude: booking.pickup.longitude,
          radius: radius,
          limit: needed + 5,
          isTrackingOn: true, // ✅ YEH ADD KARO!
        });

        console.log(
          `📍 [DISPATCH BATCH] Found ${drivers.length} drivers within ${radius} KM`,
        );

        const existingRequests =
          await this.requestService.getRequestsByBooking(bookingId);
        const notifiedDriverIds = new Set(
          existingRequests.map((r: any) => r.driverId.toString()),
        );

        let availableDrivers = drivers.filter(
          (d) => !notifiedDriverIds.has(d.userId.toString()),
        );

        availableDrivers = availableDrivers.slice(0, needed);

        console.log(
          `📍 [DISPATCH BATCH] ${availableDrivers.length} new drivers available`,
        );

        const customerId = this.validateObjectId(booking.customerId);
        const isRetry = this.isRetryMode.get(bookingId) || false;

        if (availableDrivers.length === 0) {
          console.log(
            `⚠️ [DISPATCH BATCH] No new drivers found in radius ${radius} KM`,
          );

          if (activeCount === 0) {
            booking.currentBatch += 1;
            await booking.save({ session });
            console.log(
              `📊 [DISPATCH BATCH] Incremented batch to ${booking.currentBatch}`,
            );

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
          committed = true;
          session.endSession();
          return;
        }

        // ✅ Create requests for available drivers
        const requests = await this.requestService.createBatchRequests(
          booking,
          availableDrivers,
          currentBatch,
          session,
        );

        booking.driversFound =
          (booking.driversFound || 0) + availableDrivers.length;
        await booking.save({ session });

        console.log(
          `📤 [DISPATCH BATCH] Created ${requests.length} ride requests`,
        );

        // ✅ Send requests to drivers with complete details
        for (const request of requests) {
          const driverStatus = await RideDriverStatus.findOne({
            userId: request.driverId,
          }).session(session);

          if (driverStatus && driverStatus.socketId) {
            const fare = booking.fare?.totalFare || 0;
            const originalFare = booking.originalFare || fare;

            activeRequestIds.add(request._id.toString());

            console.log(`🚗 [DISPATCH] Sending to driver: ${request.driverId}`);
            console.log(`🚗 [DISPATCH] Socket ID: ${driverStatus.socketId}`);
            console.log(`🚗 [DISPATCH] Batch: ${currentBatch + 1}`);
            console.log(`🚗 [DISPATCH] Fare: ₹${fare}`);
            console.log(`🚗 [DISPATCH] Is Retry: ${isRetry}`);

            // ✅ Fetch customer details from User model
            let customerDetails = null;
            try {
              customerDetails = await User.findById(booking.customerId)
                .select("name email image roles")
                .lean()
                .exec();
              console.log(
                `👤 [DISPATCH] Customer found: ${customerDetails?.name}`,
              );
            } catch (err) {
              console.error("⚠️ [DISPATCH] Failed to fetch customer:", err);
            }

            // ✅ Build complete payload with customer and booking details
            const completePayload = {
              requestId: request._id.toString(),
              customer: {
                customerId: booking.customerId.toString(),
                name: customerDetails?.name || "Customer",
                profilePicture: customerDetails?.image || undefined,
              },
              booking: {
                bookingId: booking.bookingId,
                rideCode: booking.rideCode || "",
                serviceType: booking.serviceType || "STANDARD",
                quoteId: booking.quoteId || "",
                fwsAirportRideId: booking.fwsAirportRideId || "",
              },
              fare: fare,
              distance: booking.distance || 0,
              pickup: {
                address: booking.pickup?.address || "Loading...",
                latitude: booking.pickup?.latitude || 0,
                longitude: booking.pickup?.longitude || 0,
              },
              destination: {
                address: booking.destination?.address || "Loading...",
                latitude: booking.destination?.latitude || 0,
                longitude: booking.destination?.longitude || 0,
              },
              expiresAt:
                request.expiresAt || new Date(Date.now() + 20000).toISOString(),
              isRetry: isRetry || false,
              batchNumber: String(currentBatch + 1),
            };

            console.log(
              `📤 [DISPATCH] Complete Payload:`,
              JSON.stringify(completePayload, null, 2),
            );

            // ✅ Emit with complete payload
            this.socketService.emitToDriver(
              request.driverId.toString(),
              "new-ride-request",
              completePayload,
              driverStatus.socketId,
            );

            console.log(
              `✅ [DISPATCH] new-ride-request sent to driver ${request.driverId}`,
            );
            console.log(
              `✅ [DISPATCH] Customer: ${completePayload.customer.name}`,
            );
            console.log(
              `✅ [DISPATCH] Booking: ${completePayload.booking.bookingId}`,
            );

            this.setDriverResponseTimeout(request._id.toString(), booking);
          } else {
            console.log(
              `❌ [DISPATCH] Driver ${request.driverId} has no socketId or is offline`,
            );
          }
        }

        this.activeRequests.set(bookingId, activeRequestIds);

        // ✅ Send batch-completed with driver status details
        this.socketService.emitToCustomer(
          customerId.toString(),
          "batch-completed",
          {
            bookingId: booking.bookingId,
            batchNumber: currentBatch + 1,
            driversFound: availableDrivers.length,
            driverIds: availableDrivers.map((d: any) => d.userId.toString()),
            message: `Sent requests to ${availableDrivers.length} drivers`,
            waitingForResponse: true,
            timeoutSeconds: DISPATCH_CONFIG.DRIVER_RESPONSE_TIMEOUT / 1000,
            searchRadius: radius,
          },
        );

        console.log(
          `📤 [DISPATCH] Batch ${currentBatch + 1} sent to ${availableDrivers.length} drivers`,
        );

        if (availableDrivers.length > 0) {
          booking.currentBatch += 1;
          await booking.save({ session });
          console.log(
            `📊 [DISPATCH BATCH] Incremented batch to ${booking.currentBatch}`,
          );
        }

        await session.commitTransaction();
        committed = true;
        session.endSession();

        console.log(
          `✅ [DISPATCH BATCH] Batch ${currentBatch + 1} processed successfully`,
        );
        console.log(`========================================`);
        return;
      } catch (error: any) {
        if (!committed && session.inTransaction()) {
          await session.abortTransaction();
        }
        session.endSession();

        if (
          error.code === 112 ||
          error.codeName === "WriteConflict" ||
          error.errorLabelSet?.has("TransientTransactionError")
        ) {
          retries--;
          console.log(
            `⚠️ [DISPATCH] Write conflict for ${bookingId}, retries left: ${retries}`,
          );

          if (retries === 0) {
            console.error(`❌ [DISPATCH] Max retries exceeded:`, error);
            try {
              const booking = await RideBooking.findOne({ bookingId });
              if (booking && booking.status === "searching") {
                booking.status = "no_driver_found";
                booking.searchCompleted = true;
                await booking.save();
                console.log(
                  `✅ [DISPATCH] Forced status to no_driver_found after max retries`,
                );
              }
            } catch (finalError) {
              console.error(
                `❌ [DISPATCH] Failed to force status update:`,
                finalError,
              );
            }
            throw error;
          }

          const delay = 100 * (4 - retries);
          console.log(`⏳ [DISPATCH] Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        console.error(
          `❌ Error in dispatch batch processing for ${bookingId}:`,
          error,
        );
        throw error;
      }
    }
  }

  // services/tizzyos/cab/rideDispatchService.ts

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

        // ✅ Customer: driver-timeout (NO trackingId)
        this.socketService.emitToCustomer(
          customerId.toString(),
          "driver-timeout",
          {
            bookingId: booking.bookingId,
            driverId: request.driverId.toString(),
            requestId: requestId,
            message: "Driver did not respond in time",
          },
        );

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

  private async replenishDriver(bookingId: string): Promise<void> {
    try {
      const booking = await RideBooking.findOne({ bookingId });
      if (!booking || booking.status !== "searching") return;

      const activeRequestIds = this.activeRequests.get(bookingId) || new Set();
      const currentBatch = booking.currentBatch;
      const radius = this.getRadiusForBatch(currentBatch);

      const existingRequests =
        await this.requestService.getRequestsByBooking(bookingId);
      const notifiedDriverIds = new Set(
        existingRequests.map((r: any) => r.driverId.toString()),
      );

      const drivers = await this.searchService.findNearbyDrivers({
        latitude: booking.pickup.latitude,
        longitude: booking.pickup.longitude,
        radius: radius,
        limit: 5,
        isTrackingOn: true, // ✅ YEH ADD KARO!
      });

      const availableDrivers = drivers.filter(
        (d) => !notifiedDriverIds.has(d.userId.toString()),
      );

      if (availableDrivers.length === 0) return;

      const driver = availableDrivers[0];

      const session = await mongoose.startSession();
      session.startTransaction();
      let committed = false;

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

            // ✅ Fetch customer details for replenish
            let customerDetails = null;
            try {
              customerDetails = await User.findById(booking.customerId)
                .select("name email image roles")
                .lean()
                .exec();
            } catch (err) {
              console.error("⚠️ [REPLENISH] Failed to fetch customer:", err);
            }

            const completePayload = {
              requestId: request._id.toString(),
              customer: {
                customerId: booking.customerId.toString(),
                name: customerDetails?.name || "Customer",
                profilePicture: customerDetails?.image || undefined,
              },
              booking: {
                bookingId: booking.bookingId,
                rideCode: booking.rideCode || "",
                serviceType: booking.serviceType || "STANDARD",
                quoteId: booking.quoteId || "",
                fwsAirportRideId: booking.fwsAirportRideId || "",
              },
              fare: fare,
              distance: booking.distance || 0,
              pickup: {
                address: booking.pickup?.address || "Loading...",
                latitude: booking.pickup?.latitude || 0,
                longitude: booking.pickup?.longitude || 0,
              },
              destination: {
                address: booking.destination?.address || "Loading...",
                latitude: booking.destination?.latitude || 0,
                longitude: booking.destination?.longitude || 0,
              },
              expiresAt:
                request.expiresAt || new Date(Date.now() + 20000).toISOString(),
              isRetry: isRetry || false,
              batchNumber: String(currentBatch + 1),
            };

            this.socketService.emitToDriver(
              request.driverId.toString(),
              "new-ride-request",
              completePayload,
              driverStatus.socketId,
            );

            this.setDriverResponseTimeout(request._id.toString(), booking);
          }
        }

        await session.commitTransaction();
        committed = true;
      } catch (error) {
        if (!committed && session.inTransaction()) {
          await session.abortTransaction();
        }
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

  // ✅ UPDATED: retryDispatch with retryHistory
  async retryDispatch(bookingId: string): Promise<void> {
    console.log(`========================================`);
    console.log(`🔄 [RETRY DISPATCH] Booking: ${bookingId}`);
    console.log(`========================================`);

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
    const originalFare = booking.originalFare || currentFare;
    const incrementPercentage = DISPATCH_CONFIG.RETRY_FARE_INCREMENT;
    const newFare = Math.round(currentFare * (1 + incrementPercentage));
    const retryAttempts = (booking.retryAttempts || 0) + 1;
    const currentBatch = booking.currentBatch || 0;
    const radius = this.getRadiusForBatch(currentBatch);

    console.log(`📊 [RETRY] Original Fare: ₹${originalFare}`);
    console.log(`📊 [RETRY] Current Fare: ₹${currentFare}`);
    console.log(`📊 [RETRY] New Fare: ₹${newFare}`);
    console.log(`📊 [RETRY] Increment: ${incrementPercentage * 100}%`);
    console.log(`📊 [RETRY] Current Batch: ${currentBatch}`);
    console.log(`📊 [RETRY] Retry Attempts: ${retryAttempts}`);

    // ✅ Create retry history entry
    const retryEntry = {
      attemptNumber: retryAttempts,
      oldFare: currentFare,
      newFare: newFare,
      incrementPercentage: incrementPercentage * 100,
      batchStartedFrom: currentBatch + 1,
      timestamp: new Date(),
      radius: radius,
      status: "started" as const,
      driversFound: 0,
    };

    // ✅ Initialize retryHistory if not exists
    if (!booking.retryHistory) {
      booking.retryHistory = [];
    }

    // ✅ Push to retryHistory
    booking.retryHistory.push(retryEntry);

    // ✅ Update booking with retry details
    booking.originalFare = originalFare;
    booking.retryFare = newFare;
    booking.retryAttempts = retryAttempts;
    booking.lastFareIncrementPercentage = incrementPercentage;
    booking.fare.totalFare = newFare;
    booking.status = "searching";
    booking.searchCompleted = false;
    await booking.save();

    console.log(`✅ [RETRY] Retry history saved:`, retryEntry);

    this.isRetryMode.set(bookingId, true);

    const customerId = this.validateObjectId(booking.customerId);

    // ✅ Emit retry-started with full fare details + history
    this.socketService.emitToCustomer(customerId.toString(), "retry-started", {
      bookingId: booking.bookingId,
      message: `Retrying with increased fare: ₹${newFare}`,
      oldFare: currentFare,
      newFare: newFare,
      originalFare: originalFare,
      incrementPercentage: incrementPercentage * 100,
      continuingFromBatch: currentBatch + 1,
      retryAttempts: retryAttempts,
      retryHistory: booking.retryHistory,
    });

    // ✅ Emit fare-updated with full details
    this.socketService.emitToCustomer(customerId.toString(), "fare-updated", {
      bookingId: booking.bookingId,
      fare: newFare,
      oldFare: currentFare,
      originalFare: originalFare,
      reason: "retry",
      incrementPercentage: incrementPercentage * 100,
      retryAttempts: retryAttempts,
    });

    console.log(`✅ [RETRY] Dispatch restarted from batch ${currentBatch + 1}`);
    console.log(`✅ [RETRY] New Fare: ₹${newFare} (was ₹${currentFare})`);
    console.log(
      `✅ [RETRY] Retry History:`,
      JSON.stringify(booking.retryHistory, null, 2),
    );
    console.log(`========================================`);

    await this.startDispatch(bookingId);
  }

  async stopDispatch(bookingId: string): Promise<void> {
    console.log(`🛑 [STOP DISPATCH] Booking: ${bookingId}`);

    const interval = this.dispatchIntervals.get(bookingId);
    if (interval) {
      clearInterval(interval);
      this.dispatchIntervals.delete(bookingId);
    }

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
    console.log(`✅ [STOP DISPATCH] Stopped for booking: ${bookingId}`);
  }

  /**
   * ✅ CHANGED: Return type from Promise<void> to Promise<string>
   * Now returns the trackingId after successful acceptance
   */
  async handleDriverAccept(
    bookingId: string,
    requestId: string,
  ): Promise<string> {
    console.log(
      `✅ [DRIVER ACCEPT] Booking: ${bookingId}, Request: ${requestId}`,
    );

    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    if (!requestId || typeof requestId !== "string") {
      throw new Error("Invalid request ID");
    }

    const lockKey = `accept_lock:${bookingId}`;
    const locked = await this.lockService.acquireLock(lockKey, 30);
    if (!locked) {
      throw new Error("Another driver is already accepting this ride");
    }

    let trackingId: string | null = null;

    try {
      const session = await mongoose.startSession();
      session.startTransaction();
      let committed = false;

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

        // ✅ Generate trackingId
        trackingId = generateTrackingId();
        if (!trackingId) {
          throw new Error("Failed to generate tracking ID");
        }

        // ✅ Update booking
        booking.driverId = driverId;
        booking.status = "accepted";
        booking.acceptedAt = new Date();
        booking.searchCompleted = true;
        booking.trackingId = trackingId;
        await booking.save({ session });

        // ✅ Create tracking
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

        // ✅ Mark driver unavailable
        await RideDriverStatus.findOneAndUpdate(
          { userId: driverId },
          { $set: { isAvailable: false } },
          { session },
        );

        // ✅ Cancel other pending requests
        await this.requestService.cancelPendingRequests(
          bookingId,
          driverId,
          session,
        );

        this.activeRequests.delete(bookingId);

        // ✅ Generate QR tokens
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

        // ✅ COMMIT TRANSACTION FIRST
        await session.commitTransaction();
        committed = true;

        console.log(
          `✅ [DRIVER ACCEPT] Tracking ID: ${trackingId} saved in DB`,
        );

        // =============================================
        // ✅ SOCKET EVENTS - ONLY AFTER COMMIT
        // =============================================

        // 1. Customer: driver-accepted (ADD quoteId)
        this.socketService.emitToCustomer(
          customerId.toString(),
          "driver-accepted",
          {
            bookingId: booking.bookingId,
            trackingId: trackingId,
            quoteId: booking.quoteId, // ✅ ADD THIS
            driverId: driverId.toString(),
            message: "Driver has accepted your ride request",
          },
        );

        // 2. Driver: ride-accepted (ADD quoteId)
        this.socketService.emitToDriver(driverId.toString(), "ride-accepted", {
          bookingId: booking.bookingId,
          trackingId: trackingId,
          quoteId: booking.quoteId, // ✅ ADD THIS
          customerId: customerId.toString(),
          pickup: booking.pickup,
          destination: booking.destination,
          fare: booking.fare?.totalFare || 0,
          message: "You have accepted the ride",
        });

        // 5. Customer: ride-status-change (ADD quoteId)
        this.socketService.emitToCustomer(
          customerId.toString(),
          "ride-status-change",
          {
            bookingId: booking.bookingId,
            trackingId: trackingId,
            quoteId: booking.quoteId, // ✅ ADD THIS
            status: "accepted",
            message: "Driver is on the way",
          },
        );

        // 6. Driver: ride-status-change (ADD quoteId)
        this.socketService.emitToDriver(
          driverId.toString(),
          "ride-status-change",
          {
            bookingId: booking.bookingId,
            trackingId: trackingId,
            quoteId: booking.quoteId, // ✅ ADD THIS
            status: "accepted",
            message: "Ride accepted",
          },
        );

        // 3. Customer: qr-generated
        this.socketService.emitToCustomer(
          customerId.toString(),
          "qr-generated",
          {
            bookingId: booking.bookingId,
            trackingId: trackingId, // ✅ ADDED
            pickupQR: pickupQR,
            dropQR: dropQR,
            message: "QR codes generated for pickup and drop verification",
          },
        );

        // 4. Driver: qr-generated
        this.socketService.emitToDriver(driverId.toString(), "qr-generated", {
          bookingId: booking.bookingId,
          trackingId: trackingId, // ✅ ADDED
          pickupQR: pickupQR,
          dropQR: dropQR,
          message: "QR codes ready for verification",
        });

        this.emit("driver-accepted", {
          bookingId: booking.bookingId,
          driverId: driverId.toString(),
          customerId: customerId.toString(),
        });

        return trackingId;
      } catch (error) {
        if (!committed && session.inTransaction()) {
          await session.abortTransaction();
        }
        throw error;
      } finally {
        await session.endSession();
      }
    } finally {
      await this.lockService.releaseLock(lockKey);
    }
  }

  /**
   * ✅ FIXED: handleDriverReject with proper event
   */
  async handleDriverReject(
    bookingId: string,
    requestId: string,
  ): Promise<void> {
    console.log(
      `❌ [DRIVER REJECT] Booking: ${bookingId}, Request: ${requestId}`,
    );

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

        // ✅ Customer: driver-rejected (NO trackingId)
        this.socketService.emitToCustomer(
          customerId.toString(),
          "driver-rejected",
          {
            bookingId: booking.bookingId,
            driverId: request.driverId.toString(),
            requestId: requestId,
            message: "Driver declined the request",
          },
        );

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
