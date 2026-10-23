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
    console.log(`🔒 [LOCK] Attempting to acquire lock: ${key} (TTL: ${ttlSeconds}s)`);
    const existing = this.locks.get(key);
    if (existing && Date.now() - existing.timestamp < ttlSeconds * 1000) {
      console.log(`🔒 [LOCK] ❌ Lock already held: ${key}, age: ${Date.now() - existing.timestamp}ms`);
      return false;
    }
    this.locks.set(key, { timestamp: Date.now() });
    console.log(`🔒 [LOCK] ✅ Lock acquired: ${key}`);
    return true;
  }

  async releaseLock(key: string): Promise<void> {
    console.log(`🔓 [LOCK] Releasing lock: ${key}`);
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
    console.log(`🏗️ [CONSTRUCTOR] Initializing RideDispatchService...`);
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
    console.log(`🏗️ [CONSTRUCTOR] ✅ RideDispatchService initialized`);
  }

  private registerCleanupHandlers(): void {
    console.log(`🧹 [CLEANUP] Registering cleanup handlers...`);
    const cleanup = async () => {
      console.log(`🧹 [CLEANUP] Signal received, cleaning up...`);
      await this.cleanup();
      process.exit(0);
    };
    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
    console.log(`🧹 [CLEANUP] ✅ Handlers registered`);
  }

  async startDispatch(bookingId: string): Promise<void> {
    console.log(`========================================`);
    console.log(`🚀 [START DISPATCH] Booking: ${bookingId}`);
    console.log(`========================================`);

    // ✅ Validate bookingId
    console.log(`🚀 [START DISPATCH] Validating bookingId: ${bookingId} (type: ${typeof bookingId})`);
    if (!bookingId || typeof bookingId !== "string") {
      console.log(`🚀 [START DISPATCH] ❌ INVALID bookingId: ${bookingId}`);
      throw new Error("Invalid booking ID");
    }
    console.log(`🚀 [START DISPATCH] ✅ bookingId valid`);

    // ✅ Check cleanup state
    console.log(`🚀 [START DISPATCH] Checking isCleaningUp: ${this.isCleaningUp}`);
    if (this.isCleaningUp) {
      console.log(`🚀 [START DISPATCH] ❌ Service is cleaning up, aborting`);
      throw new Error("Service is cleaning up");
    }
    console.log(`🚀 [START DISPATCH] ✅ Not cleaning up`);

    // ✅ Acquire lock
    const lockKey = `dispatch_lock:${bookingId}`;
    console.log(`🚀 [START DISPATCH] Acquiring lock: ${lockKey}`);
    const locked = await this.lockService.acquireLock(lockKey, 30);
    console.log(`🚀 [START DISPATCH] Lock result: ${locked}`);
    if (!locked) {
      console.log(`⚠️ [START DISPATCH] Already running for: ${bookingId}`);
      return;
    }
    console.log(`🚀 [START DISPATCH] ✅ Lock acquired`);

    try {
      // ✅ Stop existing dispatch
      console.log(`🚀 [START DISPATCH] Stopping existing dispatch for: ${bookingId}`);
      await this.stopDispatch(bookingId);
      console.log(`🚀 [START DISPATCH] ✅ Existing dispatch stopped`);

      // ✅ Fetch booking
      console.log(`🚀 [START DISPATCH] Fetching booking from DB: ${bookingId}`);
      const booking = await RideBooking.findOne({ bookingId });
      if (!booking) {
        console.log(`🚀 [START DISPATCH] ❌ BOOKING NOT FOUND: ${bookingId}`);
        throw new Error(`Booking not found: ${bookingId}`);
      }
      console.log(`🚀 [START DISPATCH] ✅ Booking found:`);
      console.log(`   - _id: ${booking._id}`);
      console.log(`   - status: ${booking.status}`);
      console.log(`   - customerId: ${booking.customerId}`);
      console.log(`   - fare: ₹${booking.fare?.totalFare || 0}`);
      console.log(`   - pickup: [${booking.pickup?.latitude}, ${booking.pickup?.longitude}]`);

      // ✅ Check booking status
      console.log(`🚀 [START DISPATCH] Checking booking status: ${booking.status}`);
      if (booking.status !== "searching") {
        console.log(`🚀 [START DISPATCH] ❌ Booking is NOT in searching state: ${booking.status}`);
        throw new Error(`Booking ${bookingId} is not in searching state`);
      }
      console.log(`🚀 [START DISPATCH] ✅ Booking is in searching state`);

      // ✅ Validate customerId
      console.log(`🚀 [START DISPATCH] Validating customerId: ${booking.customerId}`);
      const customerId = this.validateObjectId(booking.customerId);
      console.log(`🚀 [START DISPATCH] ✅ customerId validated: ${customerId}`);

      // ✅ Reset state
      console.log(`🚀 [START DISPATCH] Setting isRetryMode = false`);
      this.isRetryMode.set(bookingId, false);
      console.log(`🚀 [START DISPATCH] Setting activeRequests = new Set()`);
      this.activeRequests.set(bookingId, new Set());

      // ✅ Update booking
      console.log(`🚀 [START DISPATCH] Updating booking search state...`);
      booking.searchStartedAt = new Date();
      booking.searchCompleted = false;
      booking.currentBatch = 0;
      booking.driversFound = 0;
      await booking.save();
      console.log(`🚀 [START DISPATCH] ✅ Booking updated and saved`);

      console.log(`✅ [START DISPATCH] Booking ${bookingId} initialized`);
      console.log(`   Fare: ₹${booking.fare?.totalFare || 0}`);
      console.log(`   Max Batches: ${DISPATCH_CONFIG.MAX_BATCHES}`);

      // ✅ Emit to customer
      console.log(`🚀 [START DISPATCH] Emitting 'ride-search-started' to customer: ${customerId}`);
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
      console.log(`🚀 [START DISPATCH] ✅ 'ride-search-started' emitted`);

      // ✅ Set interval
      console.log(`🚀 [START DISPATCH] Setting dispatch interval (${DISPATCH_CONFIG.BATCH_INTERVAL}ms)...`);
      const interval = setInterval(async () => {
        console.log(`⏰ [INTERVAL] Tick for booking: ${bookingId}, isCleaningUp: ${this.isCleaningUp}`);
        if (this.isCleaningUp) {
          console.log(`⏰ [INTERVAL] ⚠️ Cleaning up, clearing interval for: ${bookingId}`);
          clearInterval(interval);
          this.dispatchIntervals.delete(bookingId);
          return;
        }

        try {
          console.log(`⏰ [INTERVAL] Calling processDispatchBatch for: ${bookingId}`);
          await this.processDispatchBatch(bookingId);
        } catch (error) {
          console.error(
            `❌ [INTERVAL] Error processing dispatch batch for ${bookingId}:`,
            error,
          );
        }
      }, DISPATCH_CONFIG.BATCH_INTERVAL);

      this.dispatchIntervals.set(bookingId, interval);
      console.log(`🚀 [START DISPATCH] ✅ Interval set and stored`);

      // ✅ Process first batch immediately
      console.log(`🚀 [START DISPATCH] Processing first batch immediately...`);
      await this.processDispatchBatch(bookingId);
      console.log(`🚀 [START DISPATCH] ✅ First batch processed`);
    } finally {
      console.log(`🚀 [START DISPATCH] Releasing lock: ${lockKey}`);
      await this.lockService.releaseLock(lockKey);
      console.log(`🚀 [START DISPATCH] ✅ Lock released`);
    }
  }

  private async processDispatchBatch(bookingId: string): Promise<void> {
    console.log(`========================================`);
    console.log(`📦 [DISPATCH BATCH] Booking: ${bookingId}`);
    console.log(`========================================`);

    // ✅ Check cleanup
    console.log(`📦 [DISPATCH BATCH] Checking isCleaningUp: ${this.isCleaningUp}`);
    if (this.isCleaningUp) {
      console.log(`📦 [DISPATCH BATCH] ⚠️ Cleaning up, skipping batch`);
      return;
    }

    let retries = 3;
    console.log(`📦 [DISPATCH BATCH] Retries available: ${retries}`);

    while (retries > 0) {
      console.log(`📦 [DISPATCH BATCH] Starting transaction (retries left: ${retries})`);
      const session = await mongoose.startSession();
      session.startTransaction();
      let committed = false;

      try {
        // ✅ Fetch booking in transaction
        console.log(`📦 [DISPATCH BATCH] Fetching booking in transaction: ${bookingId}`);
        const booking = await RideBooking.findOne({ bookingId }).session(
          session,
        );
        if (!booking) {
          console.log(`❌ [DISPATCH BATCH] BOOKING NOT FOUND: ${bookingId}`);
          console.log(`📦 [DISPATCH BATCH] Stopping dispatch...`);
          await this.stopDispatch(bookingId);
          await session.commitTransaction();
          committed = true;
          session.endSession();
          return;
        }
        console.log(`📦 [DISPATCH BATCH] ✅ Booking found:`);
        console.log(`   - status: ${booking.status}`);
        console.log(`   - searchCompleted: ${booking.searchCompleted}`);
        console.log(`   - currentBatch: ${booking.currentBatch}`);
        console.log(`   - driversFound: ${booking.driversFound || 0}`);

        // ✅ Check status
        console.log(`📦 [DISPATCH BATCH] Checking if booking is still searching...`);
        if (booking.status !== "searching" || booking.searchCompleted) {
          console.log(`⚠️ [DISPATCH BATCH] Booking not searching (status: ${booking.status}, searchCompleted: ${booking.searchCompleted}), stopping...`);
          await this.stopDispatch(bookingId);
          await session.commitTransaction();
          committed = true;
          session.endSession();
          return;
        }
        console.log(`📦 [DISPATCH BATCH] ✅ Booking is searching`);

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
        console.log(`📦 [DISPATCH BATCH] Checking max batches: ${currentBatch} >= ${DISPATCH_CONFIG.MAX_BATCHES}`);
        if (currentBatch >= DISPATCH_CONFIG.MAX_BATCHES) {
          console.log(
            `❌ [DISPATCH BATCH] MAX BATCHES REACHED! (${currentBatch} >= ${DISPATCH_CONFIG.MAX_BATCHES})`,
          );
          console.log(
            `📊 [DISPATCH BATCH] Total drivers found: ${booking.driversFound || 0}`,
          );

          // ✅ Update retry history if in retry mode
          console.log(`📦 [DISPATCH BATCH] Checking retry history update...`);
          console.log(`   - isRetryMode: ${this.isRetryMode.get(bookingId)}`);
          console.log(`   - retryHistory length: ${booking.retryHistory?.length || 0}`);
          if (
            this.isRetryMode.get(bookingId) &&
            booking.retryHistory &&
            booking.retryHistory.length > 0
          ) {
            const lastRetry =
              booking.retryHistory[booking.retryHistory.length - 1];
            console.log(`📦 [DISPATCH BATCH] Last retry entry:`, JSON.stringify(lastRetry, null, 2));
            if (lastRetry && lastRetry.status === "started") {
              lastRetry.status = "completed";
              lastRetry.completedAt = new Date();
              lastRetry.driversFound = booking.driversFound || 0;
              console.log(`✅ [RETRY] Retry history updated:`, JSON.stringify(lastRetry, null, 2));
            } else {
              console.log(`📦 [DISPATCH BATCH] Last retry status is not 'started': ${lastRetry?.status}`);
            }
          } else {
            console.log(`📦 [DISPATCH BATCH] Skipping retry history update (not in retry mode or no history)`);
          }

          // ✅ Set status to no_driver_found
          console.log(`📦 [DISPATCH BATCH] Setting status to 'no_driver_found'...`);
          booking.status = "no_driver_found";
          booking.searchCompleted = true;
          await booking.save({ session });
          console.log(`📦 [DISPATCH BATCH] ✅ Booking saved with no_driver_found`);

          await session.commitTransaction();
          committed = true;
          session.endSession();
          console.log(`📦 [DISPATCH BATCH] ✅ Transaction committed`);

          console.log(`✅ [DISPATCH BATCH] Status updated to no_driver_found`);

          const customerId = this.validateObjectId(booking.customerId);
          console.log(`📦 [DISPATCH BATCH] Customer ID: ${customerId}`);

          // ✅ Emit no-driver-found with fare details + retry history
          console.log(`📤 [DISPATCH BATCH] Emitting 'no-driver-found' to customer: ${customerId}`);
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

          console.log(`📤 [DISPATCH BATCH] ✅ Emitted no-driver-found event`);
          console.log(
            `📤 [DISPATCH BATCH] Fare: ₹${booking.fare?.totalFare || 0}`,
          );

          console.log(`📦 [DISPATCH BATCH] Stopping dispatch...`);
          await this.stopDispatch(bookingId);
          console.log(`📦 [DISPATCH BATCH] ✅ Dispatch stopped`);

          console.log(`========================================`);
          console.log(`❌ [DISPATCH BATCH] COMPLETE - NO DRIVER FOUND`);
          console.log(`========================================`);
          return;
        }
        console.log(`📦 [DISPATCH BATCH] ✅ Max batches not reached, continuing...`);

        // ✅ Calculate radius for current batch
        console.log(`📦 [DISPATCH BATCH] Calculating radius for batch ${currentBatch}...`);
        const radius = this.getRadiusForBatch(currentBatch);
        booking.searchRadius = radius;
        console.log(
          `📍 [DISPATCH BATCH] Radius for batch ${currentBatch + 1}: ${radius} KM`,
        );

        // ✅ Check active requests
        console.log(`📦 [DISPATCH BATCH] Checking active requests...`);
        const activeRequestIds =
          this.activeRequests.get(bookingId) || new Set();
        const activeCount = activeRequestIds.size;
        const needed = DISPATCH_CONFIG.MAX_DRIVERS_PER_BATCH - activeCount;

        console.log(`📊 [DISPATCH BATCH] Active requests: ${activeCount}`);
        console.log(`📊 [DISPATCH BATCH] Max drivers per batch: ${DISPATCH_CONFIG.MAX_DRIVERS_PER_BATCH}`);
        console.log(`📊 [DISPATCH BATCH] Needed drivers: ${needed}`);
        console.log(`📊 [DISPATCH BATCH] Active request IDs:`, Array.from(activeRequestIds));

        if (needed <= 0) {
          console.log(
            `✅ [DISPATCH BATCH] Already have ${activeCount} active requests, waiting...`,
          );
          await session.commitTransaction();
          committed = true;
          session.endSession();
          console.log(`📦 [DISPATCH BATCH] ✅ Transaction committed (waiting for active requests)`);
          return;
        }
        console.log(`📦 [DISPATCH BATCH] ✅ Need to find ${needed} more drivers`);

        // ✅ Search for nearby drivers
        console.log(`🔍 [DISPATCH BATCH] Searching nearby drivers...`);
        console.log(`   - latitude: ${booking.pickup.latitude}`);
        console.log(`   - longitude: ${booking.pickup.longitude}`);
        console.log(`   - radius: ${radius} KM`);
        console.log(`   - limit: ${needed + 5}`);
        console.log(`   - isTrackingOn: true`);

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
        console.log(`📍 [DISPATCH BATCH] Drivers found:`);
        drivers.forEach((d: any, i: number) => {
          console.log(`   ${i + 1}. userId: ${d.userId}, distance: ${d.distance}km, isTrackingOn: ${d.isTrackingOn}`);
        });

        // ✅ Get existing requests
        console.log(`📦 [DISPATCH BATCH] Fetching existing requests for booking...`);
        const existingRequests =
          await this.requestService.getRequestsByBooking(bookingId);
        console.log(`📦 [DISPATCH BATCH] Existing requests: ${existingRequests.length}`);
        existingRequests.forEach((r: any, i: number) => {
          console.log(`   ${i + 1}. requestId: ${r._id}, driverId: ${r.driverId}, status: ${r.status}`);
        });

        const notifiedDriverIds = new Set(
          existingRequests.map((r: any) => r.driverId.toString()),
        );
        console.log(`📦 [DISPATCH BATCH] Notified driver IDs:`, Array.from(notifiedDriverIds));

        // ✅ Filter out already-notified drivers
        console.log(`📦 [DISPATCH BATCH] Filtering already-notified drivers...`);
        let availableDrivers = drivers.filter((d) => {
          const driverIdStr = d.userId.toString();
          const isNotified = notifiedDriverIds.has(driverIdStr);
          if (isNotified) {
            console.log(`   ❌ Driver ${driverIdStr} already notified, skipping`);
          } else {
            console.log(`   ✅ Driver ${driverIdStr} is new`);
          }
          return !isNotified;
        });
        console.log(`📦 [DISPATCH BATCH] Available drivers after filter: ${availableDrivers.length}`);

        // ✅ Slice to needed count
        console.log(`📦 [DISPATCH BATCH] Slicing to needed count: ${needed}`);
        availableDrivers = availableDrivers.slice(0, needed);
        console.log(`📦 [DISPATCH BATCH] Available drivers after slice: ${availableDrivers.length}`);
        availableDrivers.forEach((d: any, i: number) => {
          console.log(`   ${i + 1}. userId: ${d.userId}`);
        });

        console.log(
          `📍 [DISPATCH BATCH] ${availableDrivers.length} new drivers available`,
        );

        const customerId = this.validateObjectId(booking.customerId);
        const isRetry = this.isRetryMode.get(bookingId) || false;
        console.log(`📦 [DISPATCH BATCH] Customer ID: ${customerId}, isRetry: ${isRetry}`);

        // ✅ Handle no drivers found
        console.log(`📦 [DISPATCH BATCH] Checking if no drivers available...`);
        if (availableDrivers.length === 0) {
          console.log(
            `⚠️ [DISPATCH BATCH] No new drivers found in radius ${radius} KM`,
          );

          if (activeCount === 0) {
            console.log(`📦 [DISPATCH BATCH] No active requests either, incrementing batch...`);
            booking.currentBatch += 1;
            await booking.save({ session });
            console.log(
              `📊 [DISPATCH BATCH] Incremented batch to ${booking.currentBatch}`,
            );

            console.log(`📤 [DISPATCH BATCH] Emitting 'batch-completed' to customer...`);
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
            console.log(`📤 [DISPATCH BATCH] ✅ 'batch-completed' emitted`);
          } else {
            console.log(`📦 [DISPATCH BATCH] Active requests exist (${activeCount}), not incrementing batch`);
          }

          await session.commitTransaction();
          committed = true;
          session.endSession();
          console.log(`📦 [DISPATCH BATCH] ✅ Transaction committed (no drivers)`);
          return;
        }
        console.log(`📦 [DISPATCH BATCH] ✅ Drivers available, proceeding...`);

        // ✅ Create requests for available drivers
        console.log(`📦 [DISPATCH BATCH] Creating batch requests for ${availableDrivers.length} drivers...`);
        const requests = await this.requestService.createBatchRequests(
          booking,
          availableDrivers,
          currentBatch,
          session,
        );
        console.log(`📦 [DISPATCH BATCH] ✅ Created ${requests.length} ride requests`);
        requests.forEach((r: any, i: number) => {
          console.log(`   ${i + 1}. requestId: ${r._id}, driverId: ${r.driverId}, status: ${r.status}`);
        });

        // ✅ Update driversFound
        console.log(`📦 [DISPATCH BATCH] Updating driversFound: ${booking.driversFound || 0} + ${availableDrivers.length}`);
        booking.driversFound =
          (booking.driversFound || 0) + availableDrivers.length;
        await booking.save({ session });
        console.log(`📦 [DISPATCH BATCH] ✅ driversFound updated to: ${booking.driversFound}`);

        console.log(
          `📤 [DISPATCH BATCH] Created ${requests.length} ride requests`,
        );

        // ✅ Send requests to drivers with complete details
        console.log(`📤 [DISPATCH BATCH] Sending requests to drivers...`);
        for (const request of requests) {
          console.log(`📤 [DISPATCH] Processing request: ${request._id}`);
          console.log(`📤 [DISPATCH] Driver ID: ${request.driverId}`);

          // ✅ Fetch driver status
          console.log(`📤 [DISPATCH] Fetching driver status for: ${request.driverId}`);
          const driverStatus = await RideDriverStatus.findOne({
            userId: request.driverId,
          }).session(session);
          console.log(`📤 [DISPATCH] Driver status found: ${!!driverStatus}`);
          if (driverStatus) {
            console.log(`   - socketId: ${driverStatus.socketId}`);
            console.log(`   - isAvailable: ${driverStatus.isAvailable}`);
            console.log(`   - isOnline: ${driverStatus.isOnline}`);
          }

          // ✅ Check socket
          console.log(`📤 [DISPATCH] Checking if driver has socketId...`);
          if (driverStatus && driverStatus.socketId) {
            console.log(`📤 [DISPATCH] ✅ Driver has socketId: ${driverStatus.socketId}`);
            const fare = booking.fare?.totalFare || 0;
            const originalFare = booking.originalFare || fare;

            activeRequestIds.add(request._id.toString());
            console.log(`📤 [DISPATCH] Added request ${request._id} to active requests, total: ${activeRequestIds.size}`);

            console.log(`🚗 [DISPATCH] Sending to driver: ${request.driverId}`);
            console.log(`🚗 [DISPATCH] Socket ID: ${driverStatus.socketId}`);
            console.log(`🚗 [DISPATCH] Batch: ${currentBatch + 1}`);
            console.log(`🚗 [DISPATCH] Fare: ₹${fare}`);
            console.log(`🚗 [DISPATCH] Original Fare: ₹${originalFare}`);
            console.log(`🚗 [DISPATCH] Is Retry: ${isRetry}`);

            // ✅ Fetch customer details from User model
            console.log(`👤 [DISPATCH] Fetching customer details for: ${booking.customerId}`);
            let customerDetails = null;
            try {
              customerDetails = await User.findById(booking.customerId)
                .select("name email image roles")
                .lean()
                .exec();
              console.log(
                `👤 [DISPATCH] Customer found: ${customerDetails?.name}, email: ${customerDetails?.email}, hasImage: ${!!customerDetails?.image}`,
              );
            } catch (err) {
              console.error("⚠️ [DISPATCH] Failed to fetch customer:", err);
            }

            // ✅ Build complete payload
            console.log(`📦 [DISPATCH] Building complete payload...`);
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
            console.log(`📤 [DISPATCH] Emitting 'new-ride-request' to driver: ${request.driverId}, socket: ${driverStatus.socketId}`);
            this.socketService.emitToDriver(
              request.driverId.toString(),
              "new-ride-request",
              completePayload,
              driverStatus.socketId,
            );

            console.log(
              `✅ [DISPATCH] 'new-ride-request' sent to driver ${request.driverId}`,
            );
            console.log(
              `✅ [DISPATCH] Customer: ${completePayload.customer.name}`,
            );
            console.log(
              `✅ [DISPATCH] Booking: ${completePayload.booking.bookingId}`,
            );

            // ✅ Set timeout
            console.log(`⏰ [DISPATCH] Setting response timeout for request: ${request._id}`);
            this.setDriverResponseTimeout(request._id.toString(), booking);
            console.log(`⏰ [DISPATCH] ✅ Response timeout set`);
          } else {
            // ❌ NO SOCKET ID - LOG DETAILS
            console.log(
              `❌ [DISPATCH] Driver ${request.driverId} has no socketId or is offline`,
            );
            console.log(`❌ [DISPATCH] Driver status details:`);
            console.log(`   - driverStatus exists: ${!!driverStatus}`);
            console.log(`   - socketId: ${driverStatus?.socketId || "NONE"}`);
            console.log(`   - isAvailable: ${driverStatus?.isAvailable}`);
            console.log(`   - isOnline: ${driverStatus?.isOnline}`);
            console.log(`❌ [DISPATCH] SKIPPING request ${request._id} for driver ${request.driverId}`);
            console.log(`❌ [DISPATCH] Reason: Driver has no active socket connection`);
          }
        }

        // ✅ Update active requests map
        console.log(`📦 [DISPATCH BATCH] Updating activeRequests map, size: ${activeRequestIds.size}`);
        this.activeRequests.set(bookingId, activeRequestIds);

        // ✅ Send batch-completed with driver status details
        console.log(`📤 [DISPATCH BATCH] Emitting 'batch-completed' to customer...`);
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
        console.log(`📤 [DISPATCH BATCH] ✅ 'batch-completed' emitted`);

        console.log(
          `📤 [DISPATCH] Batch ${currentBatch + 1} sent to ${availableDrivers.length} drivers`,
        );

        // ✅ Increment batch
        if (availableDrivers.length > 0) {
          console.log(`📦 [DISPATCH BATCH] Incrementing batch from ${booking.currentBatch} to ${booking.currentBatch + 1}`);
          booking.currentBatch += 1;
          await booking.save({ session });
          console.log(
            `📊 [DISPATCH BATCH] ✅ Incremented batch to ${booking.currentBatch}`,
          );
        } else {
          console.log(`📦 [DISPATCH BATCH] ⚠️ No available drivers, not incrementing batch`);
        }

        await session.commitTransaction();
        committed = true;
        session.endSession();
        console.log(`📦 [DISPATCH BATCH] ✅ Transaction committed`);

        console.log(
          `✅ [DISPATCH BATCH] Batch ${currentBatch + 1} processed successfully`,
        );
        console.log(`========================================`);
        return;
      } catch (error: any) {
        console.error(`❌ [DISPATCH BATCH] ERROR in transaction:`, error);
        console.error(`❌ [DISPATCH BATCH] Error code: ${error.code}, codeName: ${error.codeName}`);
        console.error(`❌ [DISPATCH BATCH] Error label set:`, error.errorLabelSet);

        if (!committed && session.inTransaction()) {
          console.log(`📦 [DISPATCH BATCH] Aborting transaction...`);
          await session.abortTransaction();
          console.log(`📦 [DISPATCH BATCH] ✅ Transaction aborted`);
        }
        session.endSession();

        // ✅ Handle write conflicts
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
            console.log(`📦 [DISPATCH] Attempting to force status update...`);
            try {
              const booking = await RideBooking.findOne({ bookingId });
              if (booking && booking.status === "searching") {
                console.log(`📦 [DISPATCH] Force setting status to no_driver_found...`);
                booking.status = "no_driver_found";
                booking.searchCompleted = true;
                await booking.save();
                console.log(
                  `✅ [DISPATCH] Forced status to no_driver_found after max retries`,
                );
              } else {
                console.log(`📦 [DISPATCH] Booking status is not 'searching': ${booking?.status}`);
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
          console.log(`⏳ [DISPATCH] Delay complete, retrying...`);
          continue;
        }

        console.error(
          `❌ [DISPATCH] Non-retryable error in dispatch batch for ${bookingId}:`,
          error,
        );
        throw error;
      }
    }
    console.log(`📦 [DISPATCH BATCH] ⚠️ Exited retry loop`);
  }

  private setDriverResponseTimeout(requestId: string, booking: IBooking): void {
    console.log(`⏰ [TIMEOUT] Setting timeout for request: ${requestId}`);
    console.log(`⏰ [TIMEOUT] Timeout duration: ${DISPATCH_CONFIG.DRIVER_RESPONSE_TIMEOUT}ms`);
    console.log(`⏰ [TIMEOUT] Booking: ${booking.bookingId}`);

    // ✅ Clear existing timeout
    console.log(`⏰ [TIMEOUT] Clearing existing timeout for: ${requestId}`);
    this.clearResponseTimeout(requestId);

    const timeout = setTimeout(async () => {
      console.log(`⏰ [TIMEOUT] ⏰ TIMEOUT FIRED for request: ${requestId}`);
      console.log(`⏰ [TIMEOUT] isCleaningUp: ${this.isCleaningUp}`);

      if (this.isCleaningUp) {
        console.log(`⏰ [TIMEOUT] ⚠️ Cleaning up, skipping timeout processing`);
        return;
      }

      try {
        // ✅ Fetch request
        console.log(`⏰ [TIMEOUT] Fetching request: ${requestId}`);
        const request = await this.requestService.getRequest(requestId);
        console.log(`⏰ [TIMEOUT] Request found: ${!!request}`);
        if (request) {
          console.log(`   - status: ${request.status}`);
          console.log(`   - driverId: ${request.driverId}`);
        }

        if (!request || request.status !== "pending") {
          console.log(`⏰ [TIMEOUT] ⚠️ Request not pending (status: ${request?.status}), skipping`);
          this.responseTimeouts.delete(requestId);
          return;
        }
        console.log(`⏰ [TIMEOUT] ✅ Request is still pending, processing timeout...`);

        // ✅ Update request status
        console.log(`⏰ [TIMEOUT] Updating request status to 'timeout'...`);
        await this.requestService.updateRequest(requestId, {
          status: "timeout",
          respondedAt: new Date(),
        });
        console.log(`⏰ [TIMEOUT] ✅ Request status updated to 'timeout'`);

        // ✅ Remove from active requests
        console.log(`⏰ [TIMEOUT] Removing from active requests...`);
        const activeRequestIds = this.activeRequests.get(booking.bookingId);
        if (activeRequestIds) {
          activeRequestIds.delete(requestId);
          console.log(`⏰ [TIMEOUT] ✅ Removed, remaining active: ${activeRequestIds.size}`);
        } else {
          console.log(`⏰ [TIMEOUT] ⚠️ No active requests found for booking: ${booking.bookingId}`);
        }

        const driverId = this.validateObjectId(request.driverId);
        const rideId = this.validateObjectId(booking._id);
        console.log(`⏰ [TIMEOUT] Driver ID: ${driverId}, Ride ID: ${rideId}`);

        // ✅ Record fraud action
        console.log(`⏰ [TIMEOUT] Recording fraud action...`);
        await this.fraudService.recordDriverAction({
          userId: driverId,
          bookingId: booking.bookingId,
          rideId: rideId,
          action: "timeout",
          rideCode: booking.rideCode,
        });
        console.log(`⏰ [TIMEOUT] ✅ Fraud action recorded`);

        const customerId = this.validateObjectId(booking.customerId);
        console.log(`⏰ [TIMEOUT] Customer ID: ${customerId}`);

        // ✅ Customer: driver-timeout (NO trackingId)
        console.log(`📤 [TIMEOUT] Emitting 'driver-timeout' to customer: ${customerId}`);
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
        console.log(`📤 [TIMEOUT] ✅ 'driver-timeout' emitted`);

        // ✅ Replenish driver
        console.log(`⏰ [TIMEOUT] Calling replenishDriver for: ${booking.bookingId}`);
        this.replenishDriver(booking.bookingId);
        console.log(`⏰ [TIMEOUT] ✅ replenishDriver called`);

        this.responseTimeouts.delete(requestId);
        console.log(`⏰ [TIMEOUT] ✅ Timeout removed from map`);
      } catch (error) {
        console.error(
          `❌ [TIMEOUT] Failed to process driver timeout for request ${requestId}:`,
          error,
        );
      }
    }, DISPATCH_CONFIG.DRIVER_RESPONSE_TIMEOUT);

    this.responseTimeouts.set(requestId, timeout);
    console.log(`⏰ [TIMEOUT] ✅ Timeout stored in map, total timeouts: ${this.responseTimeouts.size}`);
  }

  private async replenishDriver(bookingId: string): Promise<void> {
    console.log(`🔄 [REPLENISH] Starting replenish for booking: ${bookingId}`);
    try {
      // ✅ Fetch booking
      console.log(`🔄 [REPLENISH] Fetching booking: ${bookingId}`);
      const booking = await RideBooking.findOne({ bookingId });
      if (!booking) {
        console.log(`🔄 [REPLENISH] ❌ Booking not found: ${bookingId}`);
        return;
      }
      console.log(`🔄 [REPLENISH] ✅ Booking found, status: ${booking.status}`);

      if (booking.status !== "searching") {
        console.log(`🔄 [REPLENISH] ⚠️ Booking not searching (status: ${booking.status}), skipping`);
        return;
      }
      console.log(`🔄 [REPLENISH] ✅ Booking is searching`);

      // ✅ Get active requests
      console.log(`🔄 [REPLENISH] Getting active requests...`);
      const activeRequestIds = this.activeRequests.get(bookingId) || new Set();
      console.log(`🔄 [REPLENISH] Active requests: ${activeRequestIds.size}`);

      const currentBatch = booking.currentBatch;
      const radius = this.getRadiusForBatch(currentBatch);
      console.log(`🔄 [REPLENISH] Current batch: ${currentBatch}, radius: ${radius} KM`);

      // ✅ Get existing requests
      console.log(`🔄 [REPLENISH] Fetching existing requests...`);
      const existingRequests =
        await this.requestService.getRequestsByBooking(bookingId);
      console.log(`🔄 [REPLENISH] Existing requests: ${existingRequests.length}`);

      const notifiedDriverIds = new Set(
        existingRequests.map((r: any) => r.driverId.toString()),
      );
      console.log(`🔄 [REPLENISH] Notified driver IDs:`, Array.from(notifiedDriverIds));

      // ✅ Search for drivers
      console.log(`🔍 [REPLENISH] Searching for drivers...`);
      console.log(`   - latitude: ${booking.pickup.latitude}`);
      console.log(`   - longitude: ${booking.pickup.longitude}`);
      console.log(`   - radius: ${radius} KM`);
      console.log(`   - limit: 5`);

      const drivers = await this.searchService.findNearbyDrivers({
        latitude: booking.pickup.latitude,
        longitude: booking.pickup.longitude,
        radius: radius,
        limit: 5,
        isTrackingOn: true, // ✅ YEH ADD KARO!
      });
      console.log(`🔍 [REPLENISH] Found ${drivers.length} drivers`);
      drivers.forEach((d: any, i: number) => {
        console.log(`   ${i + 1}. userId: ${d.userId}, distance: ${d.distance}km`);
      });

      // ✅ Filter available drivers
      console.log(`🔄 [REPLENISH] Filtering available drivers...`);
      const availableDrivers = drivers.filter((d) => {
        const driverIdStr = d.userId.toString();
        const isNotified = notifiedDriverIds.has(driverIdStr);
        if (isNotified) {
          console.log(`   ❌ Driver ${driverIdStr} already notified, skipping`);
        } else {
          console.log(`   ✅ Driver ${driverIdStr} is new`);
        }
        return !isNotified;
      });
      console.log(`🔄 [REPLENISH] Available drivers: ${availableDrivers.length}`);

      if (availableDrivers.length === 0) {
        console.log(`🔄 [REPLENISH] ⚠️ No available drivers found, skipping`);
        return;
      }

      const driver = availableDrivers[0];
      console.log(`🔄 [REPLENISH] Selected driver: ${driver.userId}`);
      console.log(`🔄 [REPLENISH] Driver distance: ${driver.distance}km`);

      // ✅ Create session
      console.log(`🔄 [REPLENISH] Starting transaction...`);
      const session = await mongoose.startSession();
      session.startTransaction();
      let committed = false;

      try {
        // ✅ Create request
        console.log(`🔄 [REPLENISH] Creating batch request...`);
        const requests = await this.requestService.createBatchRequests(
          booking,
          [driver],
          currentBatch,
          session,
        );
        console.log(`🔄 [REPLENISH] Requests created: ${requests.length}`);

        if (requests.length > 0) {
          const request = requests[0];
          console.log(`🔄 [REPLENISH] Processing request: ${request._id}`);
          console.log(`🔄 [REPLENISH] Driver ID: ${request.driverId}`);

          // ✅ Fetch driver status
          console.log(`🔄 [REPLENISH] Fetching driver status...`);
          const driverStatus = await RideDriverStatus.findOne({
            userId: request.driverId,
          }).session(session);
          console.log(`🔄 [REPLENISH] Driver status found: ${!!driverStatus}`);
          if (driverStatus) {
            console.log(`   - socketId: ${driverStatus.socketId}`);
            console.log(`   - isAvailable: ${driverStatus.isAvailable}`);
          }

          // ✅ Check socket
          if (driverStatus && driverStatus.socketId) {
            console.log(`🔄 [REPLENISH] ✅ Driver has socketId: ${driverStatus.socketId}`);
            const fare = booking.fare?.totalFare || 0;
            const originalFare = booking.originalFare || fare;
            const isRetry = this.isRetryMode.get(bookingId) || false;

            activeRequestIds.add(request._id.toString());
            this.activeRequests.set(bookingId, activeRequestIds);
            console.log(`🔄 [REPLENISH] Active requests updated: ${activeRequestIds.size}`);

            // ✅ Fetch customer details
            console.log(`👤 [REPLENISH] Fetching customer details...`);
            let customerDetails = null;
            try {
              customerDetails = await User.findById(booking.customerId)
                .select("name email image roles")
                .lean()
                .exec();
              console.log(`👤 [REPLENISH] Customer: ${customerDetails?.name}`);
            } catch (err) {
              console.error("⚠️ [REPLENISH] Failed to fetch customer:", err);
            }

            // ✅ Build payload
            console.log(`📦 [REPLENISH] Building payload...`);
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
              `📤 [REPLENISH] Complete Payload:`,
              JSON.stringify(completePayload, null, 2),
            );

            // ✅ Emit
            console.log(`📤 [REPLENISH] Emitting 'new-ride-request' to driver: ${request.driverId}`);
            this.socketService.emitToDriver(
              request.driverId.toString(),
              "new-ride-request",
              completePayload,
              driverStatus.socketId,
            );
            console.log(`📤 [REPLENISH] ✅ Request sent`);

            // ✅ Set timeout
            console.log(`⏰ [REPLENISH] Setting response timeout...`);
            this.setDriverResponseTimeout(request._id.toString(), booking);
            console.log(`⏰ [REPLENISH] ✅ Timeout set`);
          } else {
            console.log(`❌ [REPLENISH] Driver has no socketId, skipping`);
            console.log(`   - driverStatus: ${!!driverStatus}`);
            console.log(`   - socketId: ${driverStatus?.socketId || "NONE"}`);
          }
        } else {
          console.log(`🔄 [REPLENISH] ⚠️ No requests created`);
        }

        await session.commitTransaction();
        committed = true;
        console.log(`🔄 [REPLENISH] ✅ Transaction committed`);
      } catch (error) {
        console.error(`❌ [REPLENISH] Error in transaction:`, error);
        if (!committed && session.inTransaction()) {
          console.log(`🔄 [REPLENISH] Aborting transaction...`);
          await session.abortTransaction();
          console.log(`🔄 [REPLENISH] ✅ Transaction aborted`);
        }
        console.error(`Error replenishing driver for ${bookingId}:`, error);
      } finally {
        await session.endSession();
        console.log(`🔄 [REPLENISH] Session ended`);
      }
    } catch (error) {
      console.error(`❌ [REPLENISH] Error in replenishDriver for ${bookingId}:`, error);
    }
    console.log(`🔄 [REPLENISH] ✅ Replenish complete for: ${bookingId}`);
  }

  private clearResponseTimeout(requestId: string): void {
    console.log(`⏰ [CLEAR TIMEOUT] Clearing timeout for request: ${requestId}`);
    const timeout = this.responseTimeouts.get(requestId);
    if (timeout) {
      clearTimeout(timeout);
      this.responseTimeouts.delete(requestId);
      console.log(`⏰ [CLEAR TIMEOUT] ✅ Timeout cleared, remaining: ${this.responseTimeouts.size}`);
    } else {
      console.log(`⏰ [CLEAR TIMEOUT] ⚠️ No timeout found for: ${requestId}`);
    }
  }

  // ✅ UPDATED: retryDispatch with retryHistory
  async retryDispatch(bookingId: string): Promise<void> {
    console.log(`========================================`);
    console.log(`🔄 [RETRY DISPATCH] Booking: ${bookingId}`);
    console.log(`========================================`);

    // ✅ Validate bookingId
    console.log(`🔄 [RETRY] Validating bookingId: ${bookingId}`);
    if (!bookingId || typeof bookingId !== "string") {
      console.log(`🔄 [RETRY] ❌ Invalid bookingId`);
      throw new Error("Invalid booking ID");
    }
    console.log(`🔄 [RETRY] ✅ bookingId valid`);

    // ✅ Fetch booking
    console.log(`🔄 [RETRY] Fetching booking: ${bookingId}`);
    const booking = await RideBooking.findOne({ bookingId });
    if (!booking) {
      console.log(`🔄 [RETRY] ❌ Booking not found: ${bookingId}`);
      throw new Error(`Booking not found: ${bookingId}`);
    }
    console.log(`🔄 [RETRY] ✅ Booking found, status: ${booking.status}`);

    // ✅ Check status
    console.log(`🔄 [RETRY] Checking status: ${booking.status}`);
    if (booking.status !== "no_driver_found") {
      console.log(`🔄 [RETRY] ❌ Booking not in no_driver_found state: ${booking.status}`);
      throw new Error(`Booking ${bookingId} is not in no_driver_found state`);
    }
    console.log(`🔄 [RETRY] ✅ Booking is in no_driver_found state`);

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
    console.log(`📊 [RETRY] Radius: ${radius} KM`);

    // ✅ Create retry history entry
    console.log(`🔄 [RETRY] Creating retry entry...`);
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
    console.log(`🔄 [RETRY] Retry entry:`, JSON.stringify(retryEntry, null, 2));

    // ✅ Initialize retryHistory if not exists
    console.log(`🔄 [RETRY] Initializing retry history...`);
    if (!booking.retryHistory) {
      booking.retryHistory = [];
      console.log(`🔄 [RETRY] retryHistory initialized as empty array`);
    }
    console.log(`🔄 [RETRY] Current history length: ${booking.retryHistory.length}`);

    // ✅ Push to retryHistory
    console.log(`🔄 [RETRY] Pushing retry entry...`);
    booking.retryHistory.push(retryEntry);
    console.log(`🔄 [RETRY] ✅ History length after push: ${booking.retryHistory.length}`);

    // ✅ Update booking with retry details
    console.log(`🔄 [RETRY] Updating booking fields...`);
    booking.originalFare = originalFare;
    booking.retryFare = newFare;
    booking.retryAttempts = retryAttempts;
    booking.lastFareIncrementPercentage = incrementPercentage;
    booking.fare.totalFare = newFare;
    booking.status = "searching";
    booking.searchCompleted = false;
    await booking.save();
    console.log(`🔄 [RETRY] ✅ Booking updated and saved`);

    console.log(`✅ [RETRY] Retry history saved:`, JSON.stringify(retryEntry, null, 2));

    // ✅ Set retry mode
    console.log(`🔄 [RETRY] Setting isRetryMode = true`);
    this.isRetryMode.set(bookingId, true);

    const customerId = this.validateObjectId(booking.customerId);
    console.log(`🔄 [RETRY] Customer ID: ${customerId}`);

    // ✅ Emit retry-started
    console.log(`📤 [RETRY] Emitting 'retry-started' to customer...`);
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
    console.log(`📤 [RETRY] ✅ 'retry-started' emitted`);

    // ✅ Emit fare-updated
    console.log(`📤 [RETRY] Emitting 'fare-updated' to customer...`);
    this.socketService.emitToCustomer(customerId.toString(), "fare-updated", {
      bookingId: booking.bookingId,
      fare: newFare,
      oldFare: currentFare,
      originalFare: originalFare,
      reason: "retry",
      incrementPercentage: incrementPercentage * 100,
      retryAttempts: retryAttempts,
    });
    console.log(`📤 [RETRY] ✅ 'fare-updated' emitted`);

    console.log(`✅ [RETRY] Dispatch restarted from batch ${currentBatch + 1}`);
    console.log(`✅ [RETRY] New Fare: ₹${newFare} (was ₹${currentFare})`);
    console.log(
      `✅ [RETRY] Retry History:`,
      JSON.stringify(booking.retryHistory, null, 2),
    );
    console.log(`========================================`);

    // ✅ Start dispatch
    console.log(`🔄 [RETRY] Calling startDispatch...`);
    await this.startDispatch(bookingId);
    console.log(`🔄 [RETRY] ✅ startDispatch complete`);
  }

  async stopDispatch(bookingId: string): Promise<void> {
    console.log(`🛑 [STOP DISPATCH] Booking: ${bookingId}`);

    // ✅ Clear interval
    console.log(`🛑 [STOP DISPATCH] Clearing dispatch interval...`);
    const interval = this.dispatchIntervals.get(bookingId);
    if (interval) {
      clearInterval(interval);
      this.dispatchIntervals.delete(bookingId);
      console.log(`🛑 [STOP DISPATCH] ✅ Interval cleared`);
    } else {
      console.log(`🛑 [STOP DISPATCH] ⚠️ No interval found`);
    }

    // ✅ Clear active request timeouts
    console.log(`🛑 [STOP DISPATCH] Clearing active request timeouts...`);
    const activeRequestIds = this.activeRequests.get(bookingId);
    if (activeRequestIds) {
      console.log(`🛑 [STOP DISPATCH] Active requests to clear: ${activeRequestIds.size}`);
      for (const requestId of activeRequestIds) {
        console.log(`🛑 [STOP DISPATCH] Clearing timeout for: ${requestId}`);
        this.clearResponseTimeout(requestId);
      }
      this.activeRequests.delete(bookingId);
      console.log(`🛑 [STOP DISPATCH] ✅ Active requests cleared`);
    } else {
      console.log(`🛑 [STOP DISPATCH] ⚠️ No active requests found`);
    }

    // ✅ Update booking
    console.log(`🛑 [STOP DISPATCH] Fetching booking from DB: ${bookingId}`);
    const booking = await RideBooking.findOne({ bookingId });
    if (booking) {
      console.log(`🛑 [STOP DISPATCH] ✅ Booking found, fetching pending requests...`);
      const requests =
        await this.requestService.getRequestsByBooking(bookingId);
      console.log(`🛑 [STOP DISPATCH] Total requests: ${requests.length}`);

      for (const request of requests) {
        if (request.status === "pending") {
          console.log(`🛑 [STOP DISPATCH] Clearing timeout for pending request: ${request._id}`);
          this.clearResponseTimeout(request._id.toString());
        }
      }

      console.log(`🛑 [STOP DISPATCH] Updating booking searchCompleted = true...`);
      booking.searchCompleted = true;
      booking.searchExpiredAt = new Date();
      await booking.save();
      console.log(`🛑 [STOP DISPATCH] ✅ Booking updated`);
    } else {
      console.log(`🛑 [STOP DISPATCH] ⚠️ Booking not found in DB`);
    }

    // ✅ Clear retry mode
    console.log(`🛑 [STOP DISPATCH] Clearing isRetryMode...`);
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
    console.log(`========================================`);
    console.log(
      `✅ [DRIVER ACCEPT] Booking: ${bookingId}, Request: ${requestId}`,
    );
    console.log(`========================================`);

    // ✅ Validate inputs
    console.log(`✅ [ACCEPT] Validating bookingId: ${bookingId}`);
    if (!bookingId || typeof bookingId !== "string") {
      console.log(`✅ [ACCEPT] ❌ Invalid bookingId`);
      throw new Error("Invalid booking ID");
    }

    console.log(`✅ [ACCEPT] Validating requestId: ${requestId}`);
    if (!requestId || typeof requestId !== "string") {
      console.log(`✅ [ACCEPT] ❌ Invalid requestId`);
      throw new Error("Invalid request ID");
    }
    console.log(`✅ [ACCEPT] ✅ Inputs valid`);

    // ✅ Acquire lock
    const lockKey = `accept_lock:${bookingId}`;
    console.log(`🔒 [ACCEPT] Acquiring lock: ${lockKey}`);
    const locked = await this.lockService.acquireLock(lockKey, 30);
    if (!locked) {
      console.log(`🔒 [ACCEPT] ❌ Lock not acquired - another driver is accepting`);
      throw new Error("Another driver is already accepting this ride");
    }
    console.log(`🔒 [ACCEPT] ✅ Lock acquired`);

    let trackingId: string | null = null;

    try {
      // ✅ Start session
      console.log(`✅ [ACCEPT] Starting transaction...`);
      const session = await mongoose.startSession();
      session.startTransaction();
      let committed = false;

      try {
        // ✅ Stop dispatch
        console.log(`✅ [ACCEPT] Stopping dispatch...`);
        await this.stopDispatch(bookingId);
        console.log(`✅ [ACCEPT] ✅ Dispatch stopped`);

        // ✅ Fetch booking
        console.log(`✅ [ACCEPT] Fetching booking in transaction...`);
        const booking = await RideBooking.findOne({ bookingId }).session(
          session,
        );
        if (!booking) {
          console.log(`✅ [ACCEPT] ❌ Booking not found: ${bookingId}`);
          throw new Error(`Booking not found: ${bookingId}`);
        }
        console.log(`✅ [ACCEPT] ✅ Booking found:`);
        console.log(`   - status: ${booking.status}`);
        console.log(`   - driverId: ${booking.driverId}`);
        console.log(`   - quoteId: ${booking.quoteId}`);

        // ✅ Check if already accepted
        console.log(`✅ [ACCEPT] Checking if already accepted...`);
        if (booking.status === "accepted" || booking.driverId) {
          console.log(`✅ [ACCEPT] ❌ Already accepted by: ${booking.driverId}`);
          throw new Error("Booking already accepted by another driver");
        }
        console.log(`✅ [ACCEPT] ✅ Not yet accepted`);

        // ✅ Accept request
        console.log(`✅ [ACCEPT] Accepting request: ${requestId}`);
        const request = await this.requestService.acceptRequest(
          requestId,
          session,
        );
        if (!request) {
          console.log(`✅ [ACCEPT] ❌ Request not found: ${requestId}`);
          throw new Error(`Request not found: ${requestId}`);
        }
        console.log(`✅ [ACCEPT] ✅ Request accepted:`);
        console.log(`   - driverId: ${request.driverId}`);
        console.log(`   - status: ${request.status}`);

        const driverId = this.validateObjectId(request.driverId);
        const customerId = this.validateObjectId(booking.customerId);
        const rideId = this.validateObjectId(booking._id);
        console.log(`✅ [ACCEPT] Driver ID: ${driverId}`);
        console.log(`✅ [ACCEPT] Customer ID: ${customerId}`);
        console.log(`✅ [ACCEPT] Ride ID: ${rideId}`);

        // ✅ Generate trackingId
        console.log(`✅ [ACCEPT] Generating trackingId...`);
        trackingId = generateTrackingId();
        if (!trackingId) {
          console.log(`✅ [ACCEPT] ❌ Failed to generate trackingId`);
          throw new Error("Failed to generate tracking ID");
        }
        console.log(`✅ [ACCEPT] ✅ trackingId generated: ${trackingId}`);

        // ✅ Update booking
        console.log(`✅ [ACCEPT] Updating booking...`);
        booking.driverId = driverId;
        booking.status = "accepted";
        booking.acceptedAt = new Date();
        booking.searchCompleted = true;
        booking.trackingId = trackingId;
        await booking.save({ session });
        console.log(`✅ [ACCEPT] ✅ Booking updated and saved`);

        // ✅ Create tracking
        console.log(`✅ [ACCEPT] Creating ride tracking...`);
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
        console.log(`✅ [ACCEPT] ✅ Tracking created and saved`);

        // ✅ Mark driver unavailable
        console.log(`✅ [ACCEPT] Marking driver unavailable: ${driverId}`);
        await RideDriverStatus.findOneAndUpdate(
          { userId: driverId },
          { $set: { isAvailable: false } },
          { session },
        );
        console.log(`✅ [ACCEPT] ✅ Driver marked unavailable`);

        // ✅ Cancel other pending requests
        console.log(`✅ [ACCEPT] Cancelling other pending requests...`);
        await this.requestService.cancelPendingRequests(
          bookingId,
          driverId,
          session,
        );
        console.log(`✅ [ACCEPT] ✅ Other requests cancelled`);

        // ✅ Clear active requests
        console.log(`✅ [ACCEPT] Clearing active requests...`);
        this.activeRequests.delete(bookingId);
        console.log(`✅ [ACCEPT] ✅ Active requests cleared`);

        // ✅ Generate QR tokens
        console.log(`✅ [ACCEPT] Generating QR tokens...`);
        const pickupToken = this.qrTokenService.generateQRToken({
          bookingId: booking.bookingId,
          trackingId: trackingId,
          rideId: rideId,
          customerId: customerId,
          driverId: driverId,
          type: "pickup",
        });
        console.log(`✅ [ACCEPT] ✅ Pickup token generated`);

        const dropToken = this.qrTokenService.generateQRToken({
          bookingId: booking.bookingId,
          trackingId: trackingId,
          rideId: rideId,
          customerId: customerId,
          driverId: driverId,
          type: "drop",
        });
        console.log(`✅ [ACCEPT] ✅ Drop token generated`);

        console.log(`✅ [ACCEPT] Generating QR code data URIs...`);
        const [pickupQR, dropQR] = await Promise.all([
          generateQRCodeDataURI(pickupToken),
          generateQRCodeDataURI(dropToken),
        ]);
        console.log(`✅ [ACCEPT] ✅ QR codes generated`);

        // ✅ Save QR to booking
        console.log(`✅ [ACCEPT] Saving QR codes to booking...`);
        booking.qr = {
          pickup: {
            token: pickupToken,
            qrUrl: pickupQR,
          },
          drop: {
            token: dropToken,
            qrUrl: dropQR,
          },
        };
        await booking.save({ session });
        console.log(`✅ [ACCEPT] ✅ QR codes saved`);

        // ✅ COMMIT TRANSACTION FIRST
        console.log(`✅ [ACCEPT] Committing transaction...`);
        await session.commitTransaction();
        committed = true;
        console.log(`✅ [ACCEPT] ✅ Transaction committed`);

        console.log(
          `✅ [DRIVER ACCEPT] Tracking ID: ${trackingId} saved in DB`,
        );

        // =============================================
        // ✅ SOCKET EVENTS - ONLY AFTER COMMIT
        // =============================================
        console.log(`📤 [ACCEPT] Emitting socket events...`);

        // 1. Customer: driver-accepted (ADD quoteId)
        console.log(`📤 [ACCEPT] 1. Emitting 'driver-accepted' to customer: ${customerId}`);
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
        console.log(`📤 [ACCEPT] ✅ 'driver-accepted' emitted to customer`);

        // 2. Driver: ride-accepted (ADD quoteId)
        console.log(`📤 [ACCEPT] 2. Emitting 'ride-accepted' to driver: ${driverId}`);
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
        console.log(`📤 [ACCEPT] ✅ 'ride-accepted' emitted to driver`);

        // 5. Customer: ride-status-change (ADD quoteId)
        console.log(`📤 [ACCEPT] 5. Emitting 'ride-status-change' to customer...`);
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
        console.log(`📤 [ACCEPT] ✅ 'ride-status-change' emitted to customer`);

        // 6. Driver: ride-status-change (ADD quoteId)
        console.log(`📤 [ACCEPT] 6. Emitting 'ride-status-change' to driver...`);
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
        console.log(`📤 [ACCEPT] ✅ 'ride-status-change' emitted to driver`);

        // 3. Customer: qr-generated
        console.log(`📤 [ACCEPT] 3. Emitting 'qr-generated' to customer...`);
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
        console.log(`📤 [ACCEPT] ✅ 'qr-generated' emitted to customer`);

        // 4. Driver: qr-generated
        console.log(`📤 [ACCEPT] 4. Emitting 'qr-generated' to driver...`);
        this.socketService.emitToDriver(driverId.toString(), "qr-generated", {
          bookingId: booking.bookingId,
          trackingId: trackingId, // ✅ ADDED
          pickupQR: pickupQR,
          dropQR: dropQR,
          message: "QR codes ready for verification",
        });
        console.log(`📤 [ACCEPT] ✅ 'qr-generated' emitted to driver`);

        // ✅ Emit internal event
        console.log(`📤 [ACCEPT] Emitting internal 'driver-accepted' event...`);
        this.emit("driver-accepted", {
          bookingId: booking.bookingId,
          driverId: driverId.toString(),
          customerId: customerId.toString(),
        });
        console.log(`📤 [ACCEPT] ✅ Internal event emitted`);

        console.log(`✅ [ACCEPT] ✅ All done, returning trackingId: ${trackingId}`);
        return trackingId;
      } catch (error) {
        console.error(`❌ [ACCEPT] Error in transaction:`, error);
        if (!committed && session.inTransaction()) {
          console.log(`✅ [ACCEPT] Aborting transaction...`);
          await session.abortTransaction();
          console.log(`✅ [ACCEPT] ✅ Transaction aborted`);
        }
        throw error;
      } finally {
        await session.endSession();
        console.log(`✅ [ACCEPT] Session ended`);
      }
    } finally {
      console.log(`🔓 [ACCEPT] Releasing lock: ${lockKey}`);
      await this.lockService.releaseLock(lockKey);
      console.log(`🔓 [ACCEPT] ✅ Lock released`);
    }
  }

  /**
   * ✅ FIXED: handleDriverReject with proper event
   */
  async handleDriverReject(
    bookingId: string,
    requestId: string,
  ): Promise<void> {
    console.log(`========================================`);
    console.log(
      `❌ [DRIVER REJECT] Booking: ${bookingId}, Request: ${requestId}`,
    );
    console.log(`========================================`);

    // ✅ Validate inputs
    console.log(`❌ [REJECT] Validating bookingId: ${bookingId}`);
    if (!bookingId || typeof bookingId !== "string") {
      console.log(`❌ [REJECT] ❌ Invalid bookingId`);
      throw new Error("Invalid booking ID");
    }

    console.log(`❌ [REJECT] Validating requestId: ${requestId}`);
    if (!requestId || typeof requestId !== "string") {
      console.log(`❌ [REJECT] ❌ Invalid requestId`);
      throw new Error("Invalid request ID");
    }
    console.log(`❌ [REJECT] ✅ Inputs valid`);

    try {
      // ✅ Update request status
      console.log(`❌ [REJECT] Updating request status to 'rejected'...`);
      const request = await this.requestService.updateRequest(requestId, {
        status: "rejected",
        respondedAt: new Date(),
      });

      if (!request) {
        console.log(`❌ [REJECT] ❌ Request not found: ${requestId}`);
        throw new Error(`Request not found: ${requestId}`);
      }
      console.log(`❌ [REJECT] ✅ Request updated, driverId: ${request.driverId}`);

      // ✅ Remove from active requests
      console.log(`❌ [REJECT] Removing from active requests...`);
      const activeRequestIds = this.activeRequests.get(bookingId);
      if (activeRequestIds) {
        activeRequestIds.delete(requestId);
        console.log(`❌ [REJECT] ✅ Removed, remaining: ${activeRequestIds.size}`);
      } else {
        console.log(`❌ [REJECT] ⚠️ No active requests found`);
      }

      // ✅ Fetch booking
      console.log(`❌ [REJECT] Fetching booking: ${bookingId}`);
      const booking = await RideBooking.findOne({ bookingId });
      if (booking) {
        console.log(`❌ [REJECT] ✅ Booking found, status: ${booking.status}`);
        const driverId = this.validateObjectId(request.driverId);
        const rideId = this.validateObjectId(booking._id);
        console.log(`❌ [REJECT] Driver ID: ${driverId}, Ride ID: ${rideId}`);

        // ✅ Record fraud action
        console.log(`❌ [REJECT] Recording fraud action...`);
        await this.fraudService.recordDriverAction({
          userId: driverId,
          bookingId: booking.bookingId,
          rideId: rideId,
          action: "rejected",
          rideCode: booking.rideCode,
        });
        console.log(`❌ [REJECT] ✅ Fraud action recorded`);

        const customerId = this.validateObjectId(booking.customerId);
        console.log(`❌ [REJECT] Customer ID: ${customerId}`);

        // ✅ Customer: driver-rejected (NO trackingId)
        console.log(`📤 [REJECT] Emitting 'driver-rejected' to customer...`);
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
        console.log(`📤 [REJECT] ✅ 'driver-rejected' emitted`);

        // ✅ Replenish driver
        console.log(`❌ [REJECT] Calling replenishDriver...`);
        await this.replenishDriver(bookingId);
        console.log(`❌ [REJECT] ✅ replenishDriver complete`);
      } else {
        console.log(`❌ [REJECT] ⚠️ Booking not found: ${bookingId}`);
      }

      // ✅ Emit internal event
      console.log(`📤 [REJECT] Emitting internal 'driver-rejected' event...`);
      this.emit("driver-rejected", {
        bookingId: bookingId,
        requestId: requestId,
        driverId: request.driverId.toString(),
      });
      console.log(`📤 [REJECT] ✅ Internal event emitted`);
    } catch (error) {
      console.error(`❌ [REJECT] Error in handleDriverReject for ${bookingId}:`, error);
      throw error;
    }
  }

  private getRadiusForBatch(batchNumber: number): number {
    console.log(`📍 [RADIUS] Calculating radius for batch: ${batchNumber}`);
    const index = Math.min(
      batchNumber,
      DISPATCH_CONFIG.RADIUS_STEPS.length - 1,
    );
    const radius = DISPATCH_CONFIG.RADIUS_STEPS[index];
    console.log(`📍 [RADIUS] Index: ${index}, Radius: ${radius} KM`);
    return radius;
  }

  private validateObjectId(
    id: string | mongoose.Types.ObjectId | any,
  ): mongoose.Types.ObjectId {
    console.log(`🔍 [VALIDATE ID] Validating: ${id} (type: ${typeof id})`);
    if (id instanceof mongoose.Types.ObjectId) {
      console.log(`🔍 [VALIDATE ID] ✅ Already ObjectId: ${id}`);
      return id;
    }
    if (id && typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
      console.log(`🔍 [VALIDATE ID] ✅ Converting string to ObjectId: ${id}`);
      return new mongoose.Types.ObjectId(id);
    }
    console.log(`🔍 [VALIDATE ID] ❌ Invalid ObjectId: ${String(id)}`);
    throw new Error(`Invalid ObjectId: ${String(id)}`);
  }

  async cleanup(): Promise<void> {
    console.log(`🧹 [CLEANUP] Starting cleanup...`);
    if (this.isCleaningUp) {
      console.log(`🧹 [CLEANUP] ⚠️ Already cleaning up, skipping`);
      return;
    }
    this.isCleaningUp = true;

    try {
      // ✅ Clear intervals
      console.log(`🧹 [CLEANUP] Clearing ${this.dispatchIntervals.size} intervals...`);
      for (const [bookingId, interval] of this.dispatchIntervals) {
        console.log(`🧹 [CLEANUP] Clearing interval for: ${bookingId}`);
        clearInterval(interval);
        this.dispatchIntervals.delete(bookingId);
      }
      console.log(`🧹 [CLEANUP] ✅ Intervals cleared`);

      // ✅ Clear timeouts
      console.log(`🧹 [CLEANUP] Clearing ${this.responseTimeouts.size} timeouts...`);
      for (const [requestId, timeout] of this.responseTimeouts) {
        console.log(`🧹 [CLEANUP] Clearing timeout for: ${requestId}`);
        clearTimeout(timeout);
        this.responseTimeouts.delete(requestId);
      }
      console.log(`🧹 [CLEANUP] ✅ Timeouts cleared`);

      // ✅ Clear maps
      console.log(`🧹 [CLEANUP] Clearing isRetryMode...`);
      this.isRetryMode.clear();
      console.log(`🧹 [CLEANUP] Clearing activeRequests...`);
      this.activeRequests.clear();
      console.log(`🧹 [CLEANUP] ✅ Maps cleared`);
    } catch (error) {
      console.error("❌ [CLEANUP] Error during cleanup:", error);
    } finally {
      this.isCleaningUp = false;
      console.log(`🧹 [CLEANUP] ✅ Cleanup complete`);
    }
  }

  getActiveDispatchCount(): number {
    const count = this.dispatchIntervals.size;
    console.log(`📊 [STATS] Active dispatch count: ${count}`);
    return count;
  }

  getActiveTimeoutCount(): number {
    const count = this.responseTimeouts.size;
    console.log(`📊 [STATS] Active timeout count: ${count}`);
    return count;
  }

  getIsRetryMode(bookingId: string): boolean {
    const isRetry = this.isRetryMode.get(bookingId) || false;
    console.log(`📊 [STATS] isRetryMode for ${bookingId}: ${isRetry}`);
    return isRetry;
  }
}