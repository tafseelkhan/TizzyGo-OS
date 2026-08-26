// handlers/tizzyos/cab/rideLiveTrackingHandler.ts

import { Server, Socket } from "socket.io";
import { getRideLiveTracking } from "../../../services/tizzyos/cab/rideLiveTrackingService";

// Store active ride tracking data
const rideTrackingRooms = new Map<string, Set<string>>(); // bookingId -> Set of customer socket IDs
const driverRideMap = new Map<string, string>(); // driverId -> quoteId
const driverLocationCache = new Map<string, any>(); // driverId -> last known location

// ============================================================
// ERROR MESSAGES FOR SOCKET
// ============================================================

const SOCKET_ERROR_MESSAGES: Record<string, string> = {
  BOOKING_ID_REQUIRED: "Booking ID is required",
  TRACKING_ID_REQUIRED: "Tracking ID is required",
  QUOTE_ID_REQUIRED: "Quote ID is required",
  BOOKING_NOT_FOUND: "Booking not found",
  UNAUTHORIZED: "You are not authorized to track this ride",
  NO_DRIVER_ASSIGNED: "No driver assigned to this ride",
  RIDE_NOT_TRACKABLE: "Ride is not in a trackable state",
  RIDE_ALREADY_COMPLETED: "This ride has already been completed or cancelled",
};

export const rideLiveTrackingHandler = (io: Server) => {
  console.log(`🔌 [LiveTracking] ========================================`);
  console.log(`🔌 [LiveTracking] 🚀 Handler initialized!`);
  console.log(`🔌 [LiveTracking] ========================================`);

  io.on("connection", (socket: Socket) => {
    console.log(`🔌 [LiveTracking] ========================================`);
    console.log(`🔌 [LiveTracking] 🆕 NEW CLIENT CONNECTED`);
    console.log(`🔌 [LiveTracking] 📍 Socket ID: ${socket.id}`);
    console.log(`🔌 [LiveTracking] 📍 Transport: ${socket.conn.transport}`);
    console.log(`🔌 [LiveTracking] ========================================`);

    // ============================================================
    // 🔥 FIX: AUTHENTICATION - Store userId on socket.data
    // ============================================================
    socket.on(
      "authenticate",
      async (data: { userId: string; userType: string; token?: string }) => {
        console.log(
          `🔐 [LiveTracking] ========================================`,
        );
        console.log(`🔐 [LiveTracking] 📡 EVENT: authenticate`);
        console.log(`🔐 [LiveTracking] 📍 Socket ID: ${socket.id}`);
        console.log(
          `🔐 [LiveTracking] 📦 Data:`,
          JSON.stringify(data, null, 2),
        );

        try {
          const { userId, userType } = data;

          if (!userId) {
            console.error(`🔐 [LiveTracking] ❌ No userId provided`);
            socket.emit("auth-error", {
              message: "User ID is required",
              event: "auth-error",
            });
            return;
          }

          // ✅ CRITICAL: Store userId on socket.data for later authorization
          socket.data.userId = userId;
          socket.data.userType = userType || "driver";
          socket.data.authenticated = true;

          console.log(
            `🔐 [LiveTracking] ✅ AUTH_SUCCESS for userId: ${userId}`,
          );
          console.log(`🔐 [LiveTracking] 📍 socket.data.userId: ${userId}`);
          console.log(
            `🔐 [LiveTracking] 📍 socket.data.userType: ${socket.data.userType}`,
          );
          console.log(
            `🔐 [LiveTracking] 📍 socket.data.authenticated: ${socket.data.authenticated}`,
          );

          console.log(`🔐 [LiveTracking] 📤 EMITTING: auth-success`);
          socket.emit("auth-success", {
            message: "Authenticated successfully",
            userId: userId,
            userType: socket.data.userType,
            event: "auth-success",
          });
          console.log(`🔐 [LiveTracking] ✅ auth-success sent to ${socket.id}`);
          console.log(
            `🔐 [LiveTracking] ========================================`,
          );
        } catch (error) {
          console.error(`🔐 [LiveTracking] ❌ Auth error:`, error);
          console.log(`🔐 [LiveTracking] 📤 EMITTING: auth-error`);
          socket.emit("auth-error", {
            message: "Authentication failed",
            event: "auth-error",
          });
          console.log(
            `🔐 [LiveTracking] ========================================`,
          );
        }
      },
    );

    // ============================================================
    // 1. DRIVER: Start sending live location
    // ============================================================
    socket.on(
      "driver:live:start",
      async (data: {
        driverId: string;
        quoteId: string;
        latitude: number;
        longitude: number;
        heading?: number;
        speed?: number;
      }) => {
        console.log(
          `🚗 [LiveTracking] ========================================`,
        );
        console.log(`🚗 [LiveTracking] 📡 EVENT: driver:live:start`);
        console.log(`🚗 [LiveTracking] 📍 Socket ID: ${socket.id}`);
        console.log(
          `🚗 [LiveTracking] 📦 Data:`,
          JSON.stringify(data, null, 2),
        );

        try {
          const { driverId, quoteId, latitude, longitude, heading, speed } =
            data;

          console.log(`🚗 [LiveTracking] 🔍 Checking driverId: ${driverId}`);
          console.log(`🚗 [LiveTracking] 🔍 Checking quoteId: ${quoteId}`);

          if (!driverId || !quoteId) {
            console.error(`🚗 [LiveTracking] ❌ Missing driverId or quoteId`);
            console.log(`🚗 [LiveTracking] 📤 EMITTING: driver:live:error`);
            socket.emit("driver:live:error", {
              message: "driverId and quoteId are required",
              event: "driver:live:error",
            });
            console.log(
              `🚗 [LiveTracking] ========================================`,
            );
            return;
          }

          // ✅ SECURITY: Verify driver is authenticated
          const authenticatedUserId = socket.data?.userId;
          console.log(
            `🚗 [LiveTracking] 🔍 authenticatedUserId: ${authenticatedUserId}`,
          );

          if (!authenticatedUserId) {
            console.error(`🚗 [LiveTracking] ❌ No authenticated userId`);
            console.log(`🚗 [LiveTracking] 📤 EMITTING: driver:live:error`);
            socket.emit("driver:live:error", {
              message: "Unauthorized: Please login again",
              event: "driver:live:error",
            });
            console.log(
              `🚗 [LiveTracking] ========================================`,
            );
            return;
          }

          if (authenticatedUserId !== driverId) {
            console.error(`🚗 [LiveTracking] ❌ Driver ID mismatch`);
            console.log(
              `🚗 [LiveTracking]    authenticatedUserId: ${authenticatedUserId}`,
            );
            console.log(`🚗 [LiveTracking]    driverId: ${driverId}`);
            console.log(`🚗 [LiveTracking] 📤 EMITTING: driver:live:error`);
            socket.emit("driver:live:error", {
              message: "Unauthorized: Driver ID mismatch",
              event: "driver:live:error",
            });
            console.log(
              `🚗 [LiveTracking] ========================================`,
            );
            return;
          }

          console.log(
            `🚗 [LiveTracking] ✅ Driver ${driverId} started live tracking for quote ${quoteId}`,
          );

          // Store mapping - driverId → quoteId
          driverRideMap.set(driverId, quoteId);
          console.log(
            `🚗 [LiveTracking] 📦 driverRideMap.set(${driverId} → ${quoteId})`,
          );

          // Join driver's room (using quoteId)
          socket.join(`ride_${quoteId}`);
          console.log(
            `🚗 [LiveTracking] ✅ Socket joined room: ride_${quoteId}`,
          );

          socket.join(`driver_${driverId}`);
          console.log(
            `🚗 [LiveTracking] ✅ Socket joined room: driver_${driverId}`,
          );

          // Cache initial location
          driverLocationCache.set(driverId, {
            latitude,
            longitude,
            heading: heading || 0,
            speed: speed || 0,
            timestamp: new Date().toISOString(),
          });
          console.log(
            `🚗 [LiveTracking] 📦 Cached initial location for ${driverId}`,
          );

          // Send initial location to all customers tracking this ride
          console.log(
            `🚗 [LiveTracking] 📤 EMITTING: driver:live:location (to room ride_${quoteId})`,
          );
          io.to(`ride_${quoteId}`).emit("driver:live:location", {
            driverId,
            quoteId,
            latitude,
            longitude,
            heading: heading || 0,
            speed: speed || 0,
            timestamp: new Date().toISOString(),
            event: "driver:live:location",
          });
          console.log(`🚗 [LiveTracking] ✅ Initial location broadcasted`);

          console.log(
            `🚗 [LiveTracking] 📤 EMITTING: driver:live:started (to ${socket.id})`,
          );
          socket.emit("driver:live:started", {
            success: true,
            message: "Live tracking started",
            quoteId,
            event: "driver:live:started",
          });
          console.log(`🚗 [LiveTracking] ✅ driver:live:started sent`);

          console.log(
            `✅ [LiveTracking] Driver ${driverId} joined room: ride_${quoteId}`,
          );
          console.log(
            `🚗 [LiveTracking] ========================================`,
          );
        } catch (error) {
          console.error(
            "❌ [LiveTracking] Error starting live tracking:",
            error,
          );
          console.log(`🚗 [LiveTracking] 📤 EMITTING: driver:live:error`);
          socket.emit("driver:live:error", {
            message:
              error instanceof Error
                ? error.message
                : "Failed to start live tracking",
            event: "driver:live:error",
          });
          console.log(
            `🚗 [LiveTracking] ========================================`,
          );
        }
      },
    );

    // ============================================================
    // 2. DRIVER: Update live location (called every 2-3 seconds)
    // ============================================================
    socket.on(
      "driver:live:update",
      async (data: {
        driverId: string;
        quoteId?: string;
        latitude: number;
        longitude: number;
        heading?: number;
        speed?: number;
        accuracy?: number;
        bearing?: number;
        altitude?: number;
        batteryLevel?: number;
        networkType?: string;
        isMockLocation?: boolean;
        provider?: string;
      }) => {
        try {
          const {
            driverId,
            quoteId,
            latitude,
            longitude,
            heading,
            speed,
            accuracy,
            bearing,
            altitude,
            batteryLevel,
            networkType,
            isMockLocation,
            provider,
          } = data;

          console.log(
            `📍 [LiveTracking] ========================================`,
          );
          console.log(`📍 [LiveTracking] 📡 EVENT: driver:live:update`);
          console.log(`📍 [LiveTracking] 📍 Socket ID: ${socket.id}`);
          console.log(`📍 [LiveTracking] 📦 driverId: ${driverId}`);
          console.log(
            `📍 [LiveTracking] 📦 quoteId: ${quoteId || "NOT_PROVIDED"}`,
          );
          console.log(
            `📍 [LiveTracking] 📦 latitude: ${latitude}, longitude: ${longitude}`,
          );

          if (!driverId) {
            console.error(`📍 [LiveTracking] ❌ No driverId provided`);
            console.log(`📍 [LiveTracking] 📤 EMITTING: driver:live:error`);
            socket.emit("driver:live:error", {
              message: "driverId is required",
              event: "driver:live:error",
            });
            console.log(
              `📍 [LiveTracking] ========================================`,
            );
            return;
          }

          // Get quoteId from map if not provided
          const activeQuoteId = quoteId || driverRideMap.get(driverId);
          console.log(`📍 [LiveTracking] 🔍 activeQuoteId: ${activeQuoteId}`);

          if (!activeQuoteId) {
            console.log(
              `📍 [LiveTracking] ⚠️ No active ride found for driver ${driverId}, skipping`,
            );
            console.log(
              `📍 [LiveTracking] ========================================`,
            );
            return;
          }

          // Update cache with all available fields
          const cacheData: any = {
            latitude,
            longitude,
            heading: heading || 0,
            speed: speed || 0,
            accuracy: accuracy || 0,
            timestamp: new Date().toISOString(),
          };

          if (bearing !== undefined) cacheData.bearing = bearing;
          if (altitude !== undefined) cacheData.altitude = altitude;
          if (batteryLevel !== undefined) cacheData.batteryLevel = batteryLevel;
          if (networkType) cacheData.networkType = networkType;
          if (isMockLocation !== undefined)
            cacheData.isMockLocation = isMockLocation;
          if (provider) cacheData.provider = provider;

          driverLocationCache.set(driverId, cacheData);
          console.log(`📍 [LiveTracking] ✅ Location cached for ${driverId}`);

          // Build broadcast payload
          const broadcastPayload: any = {
            driverId,
            quoteId: activeQuoteId,
            latitude,
            longitude,
            heading: heading || 0,
            speed: speed || 0,
            timestamp: new Date().toISOString(),
            event: "driver:live:location",
          };

          if (accuracy !== undefined) broadcastPayload.accuracy = accuracy;
          if (bearing !== undefined) broadcastPayload.bearing = bearing;
          if (altitude !== undefined) broadcastPayload.altitude = altitude;

          // Broadcast to all customers in this ride room
          console.log(
            `📍 [LiveTracking] 📤 EMITTING: driver:live:location (to room ride_${activeQuoteId})`,
          );
          io.to(`ride_${activeQuoteId}`).emit(
            "driver:live:location",
            broadcastPayload,
          );
          console.log(
            `📍 [LiveTracking] ✅ Location broadcasted to ${activeQuoteId}`,
          );

          // Also send to driver for acknowledgment
          console.log(
            `📍 [LiveTracking] 📤 EMITTING: driver:live:ack (to ${socket.id})`,
          );
          socket.emit("driver:live:ack", {
            success: true,
            timestamp: new Date().toISOString(),
            event: "driver:live:ack",
          });
          console.log(`📍 [LiveTracking] ✅ ACK sent`);

          console.log(
            `📍 [LiveTracking] ========================================`,
          );
        } catch (error) {
          console.error("❌ [LiveTracking] Error updating location:", error);
        }
      },
    );

    // ============================================================
    // 3. DRIVER: Stop live tracking
    // ============================================================
    socket.on(
      "driver:live:stop",
      async (data: { driverId: string; quoteId?: string }) => {
        console.log(
          `⏹️ [LiveTracking] ========================================`,
        );
        console.log(`⏹️ [LiveTracking] 📡 EVENT: driver:live:stop`);
        console.log(`⏹️ [LiveTracking] 📍 Socket ID: ${socket.id}`);
        console.log(
          `⏹️ [LiveTracking] 📦 Data:`,
          JSON.stringify(data, null, 2),
        );

        try {
          const { driverId, quoteId } = data;

          if (!driverId) {
            console.error(`⏹️ [LiveTracking] ❌ No driverId provided`);
            console.log(`⏹️ [LiveTracking] 📤 EMITTING: driver:live:error`);
            socket.emit("driver:live:error", {
              message: "driverId is required",
              event: "driver:live:error",
            });
            console.log(
              `⏹️ [LiveTracking] ========================================`,
            );
            return;
          }

          const activeQuoteId = quoteId || driverRideMap.get(driverId);
          console.log(`⏹️ [LiveTracking] 🔍 activeQuoteId: ${activeQuoteId}`);

          if (activeQuoteId) {
            // Notify customers that driver stopped tracking
            console.log(
              `⏹️ [LiveTracking] 📤 EMITTING: driver:live:stopped (to room ride_${activeQuoteId})`,
            );
            io.to(`ride_${activeQuoteId}`).emit("driver:live:stopped", {
              driverId,
              quoteId: activeQuoteId,
              message: "Driver stopped sharing location",
              timestamp: new Date().toISOString(),
              event: "driver:live:stopped",
            });
            console.log(`⏹️ [LiveTracking] ✅ Stopped event broadcasted`);

            // Clean up
            driverRideMap.delete(driverId);
            driverLocationCache.delete(driverId);
            console.log(`⏹️ [LiveTracking] 🧹 Cleaned up driver ${driverId}`);

            // Leave rooms
            socket.leave(`ride_${activeQuoteId}`);
            socket.leave(`driver_${driverId}`);
            console.log(
              `⏹️ [LiveTracking] ✅ Left rooms: ride_${activeQuoteId}, driver_${driverId}`,
            );
          }

          console.log(
            `⏹️ [LiveTracking] 📤 EMITTING: driver:live:stopped (to ${socket.id})`,
          );
          socket.emit("driver:live:stopped", {
            success: true,
            message: "Live tracking stopped",
            event: "driver:live:stopped",
          });
          console.log(`⏹️ [LiveTracking] ✅ Stopped confirmation sent`);

          console.log(
            `🚗 [LiveTracking] Driver ${driverId} stopped live tracking`,
          );
          console.log(
            `⏹️ [LiveTracking] ========================================`,
          );
        } catch (error) {
          console.error(
            "❌ [LiveTracking] Error stopping live tracking:",
            error,
          );
          console.log(
            `⏹️ [LiveTracking] ========================================`,
          );
        }
      },
    );

    // ============================================================
    // 4. CUSTOMER/DRIVER: Start tracking (bookingId + trackingId + quoteId)
    // ============================================================
    socket.on(
      "customer:track:start",
      async (data: {
        bookingId: string;
        trackingId: string;
        quoteId: string;
      }) => {
        console.log(
          `📡 [LiveTracking] ========================================`,
        );
        console.log(`📡 [LiveTracking] 📡 EVENT: customer:track:start`);
        console.log(`📡 [LiveTracking] 📍 Socket ID: ${socket.id}`);

        try {
          const { bookingId, trackingId, quoteId } = data;

          console.log(`📡 [LiveTracking] 📦 bookingId: ${bookingId}`);
          console.log(`📡 [LiveTracking] 📦 trackingId: ${trackingId}`);
          console.log(`📡 [LiveTracking] 📦 quoteId: ${quoteId}`);

          // ============================================================
          // VALIDATE INPUT
          // ============================================================
          if (!bookingId || bookingId.trim() === "") {
            console.error(`📡 [LiveTracking] ❌ Booking ID missing`);
            console.log(`📡 [LiveTracking] 📤 EMITTING: customer:track:error`);
            socket.emit("customer:track:error", {
              message: "Booking ID is required",
              event: "customer:track:error",
            });
            console.log(
              `📡 [LiveTracking] ========================================`,
            );
            return;
          }

          if (!trackingId || trackingId.trim() === "") {
            console.error(`📡 [LiveTracking] ❌ Tracking ID missing`);
            console.log(`📡 [LiveTracking] 📤 EMITTING: customer:track:error`);
            socket.emit("customer:track:error", {
              message: "Tracking ID is required",
              event: "customer:track:error",
            });
            console.log(
              `📡 [LiveTracking] ========================================`,
            );
            return;
          }

          if (!quoteId || quoteId.trim() === "") {
            console.error(`📡 [LiveTracking] ❌ Quote ID missing`);
            console.log(`📡 [LiveTracking] 📤 EMITTING: customer:track:error`);
            socket.emit("customer:track:error", {
              message: "Quote ID is required",
              event: "customer:track:error",
            });
            console.log(
              `📡 [LiveTracking] ========================================`,
            );
            return;
          }

          console.log(`📡 [LiveTracking] ✅ All IDs validated`);

          // ============================================================
          // GET AUTHENTICATED USER ID FROM SOCKET.DATA
          // ============================================================
          const userId = socket.data?.userId;

          console.log(`📡 [LiveTracking] 🔍 socket.data.userId: ${userId}`);
          console.log(
            `📡 [LiveTracking] 🔍 socket.data.authenticated: ${socket.data?.authenticated}`,
          );

          if (!userId) {
            console.error(`📡 [LiveTracking] ❌ No userId in socket.data!`);
            console.log(`📡 [LiveTracking] 📤 EMITTING: customer:track:error`);
            socket.emit("customer:track:error", {
              message: "Unauthorized: Please login again",
              event: "customer:track:error",
            });
            console.log(
              `📡 [LiveTracking] ========================================`,
            );
            return;
          }

          console.log(
            `👤 [LiveTracking] User ${userId} started tracking booking ${bookingId}`,
          );

          // ============================================================
          // CALL SERVICE - validates booking + tracking + authorization
          // ============================================================
          console.log(`📡 [LiveTracking] 🔄 Calling getRideLiveTracking...`);
          const trackingData = await getRideLiveTracking({
            bookingId,
            trackingId,
            quoteId,
            userId,
            includeCachedLocation: false,
          });
          console.log(`📡 [LiveTracking] ✅ getRideLiveTracking completed`);

          // ============================================================
          // GET CACHED LOCATION FOR DRIVER
          // ============================================================
          const driverId = trackingData.driver.userId;
          console.log(
            `📡 [LiveTracking] 🔍 driverId from trackingData: ${driverId}`,
          );

          const cachedLoc = driverLocationCache.get(driverId);
          console.log(
            `📡 [LiveTracking] 🔍 cachedLoc: ${cachedLoc ? "FOUND" : "NOT FOUND"}`,
          );

          let cachedLocData = null;
          if (cachedLoc) {
            cachedLocData = {
              latitude: cachedLoc.latitude,
              longitude: cachedLoc.longitude,
              heading: cachedLoc.heading || 0,
              speed: cachedLoc.speed || 0,
              timestamp: cachedLoc.timestamp || new Date().toISOString(),
            };
            console.log(
              `📡 [LiveTracking] ✅ Cached location found for driver ${driverId}`,
            );
          }

          if (cachedLocData) {
            trackingData.driver.cachedLocation = cachedLocData;
            console.log(
              `📡 [LiveTracking] ✅ Added cached location to trackingData`,
            );
          }

          // ============================================================
          // JOIN ROOMS (using quoteId)
          // ============================================================
          console.log(`📡 [LiveTracking] 🔄 Joining room: ride_${quoteId}`);
          socket.join(`ride_${quoteId}`);
          console.log(`📡 [LiveTracking] ✅ Joined room: ride_${quoteId}`);

          socket.join(`user_${userId}`);
          console.log(`📡 [LiveTracking] ✅ Joined room: user_${userId}`);

          // Store tracking
          if (!rideTrackingRooms.has(bookingId)) {
            rideTrackingRooms.set(bookingId, new Set());
            console.log(
              `📡 [LiveTracking] ✅ Created new tracking set for booking ${bookingId}`,
            );
          }
          rideTrackingRooms.get(bookingId)?.add(socket.id);
          console.log(`📡 [LiveTracking] ✅ Added socket to tracking set`);

          console.log(
            `✅ [LiveTracking] User ${userId} joined room: ride_${quoteId}`,
          );

          // ============================================================
          // SEND SUCCESS RESPONSE
          // ============================================================
          console.log(`📡 [LiveTracking] 📤 EMITTING: customer:track:success`);
          socket.emit("customer:track:success", {
            success: true,
            message: "Now tracking driver",
            data: trackingData,
            event: "customer:track:success",
          });
          console.log(`📡 [LiveTracking] ✅ customer:track:success sent`);

          // ============================================================
          // SEND CACHED LOCATION IF AVAILABLE
          // ============================================================
          if (cachedLoc) {
            console.log(
              `📡 [LiveTracking] 📤 EMITTING: driver:live:location (cached)`,
            );
            socket.emit("driver:live:location", {
              driverId,
              quoteId,
              latitude: cachedLoc.latitude,
              longitude: cachedLoc.longitude,
              heading: cachedLoc.heading || 0,
              speed: cachedLoc.speed || 0,
              timestamp: cachedLoc.timestamp || new Date().toISOString(),
              fromCache: true,
              event: "driver:live:location",
            });
            console.log(`📡 [LiveTracking] ✅ Cached location sent`);
          }

          console.log(
            `📡 [LiveTracking] ========================================`,
          );
        } catch (error) {
          console.error("❌ [LiveTracking] Error tracking driver:", error);

          let errorMessage = "Failed to track driver";
          if (error instanceof Error) {
            const errorKey = error.message;
            errorMessage = SOCKET_ERROR_MESSAGES[errorKey] || error.message;
          }

          console.log(`📡 [LiveTracking] 📤 EMITTING: customer:track:error`);
          socket.emit("customer:track:error", {
            message: errorMessage,
            event: "customer:track:error",
          });
          console.log(
            `📡 [LiveTracking] ========================================`,
          );
        }
      },
    );

    // ============================================================
    // 5. CUSTOMER: Stop tracking
    // ============================================================
    socket.on(
      "customer:track:stop",
      async (data: { bookingId: string; trackingId?: string }) => {
        console.log(
          `⏹️ [LiveTracking] ========================================`,
        );
        console.log(`⏹️ [LiveTracking] 📡 EVENT: customer:track:stop`);
        console.log(`⏹️ [LiveTracking] 📍 Socket ID: ${socket.id}`);
        console.log(
          `⏹️ [LiveTracking] 📦 Data:`,
          JSON.stringify(data, null, 2),
        );

        try {
          const { bookingId, trackingId } = data;

          if (!bookingId || bookingId.trim() === "") {
            console.error(`⏹️ [LiveTracking] ❌ Booking ID missing`);
            console.log(`⏹️ [LiveTracking] 📤 EMITTING: customer:track:error`);
            socket.emit("customer:track:error", {
              message: "Booking ID is required",
              event: "customer:track:error",
            });
            console.log(
              `⏹️ [LiveTracking] ========================================`,
            );
            return;
          }

          const userId = socket.data?.userId;
          console.log(`⏹️ [LiveTracking] 🔍 userId: ${userId}`);

          if (!userId) {
            console.error(`⏹️ [LiveTracking] ❌ No authenticated userId`);
            console.log(`⏹️ [LiveTracking] 📤 EMITTING: customer:track:error`);
            socket.emit("customer:track:error", {
              message: "Unauthorized",
              event: "customer:track:error",
            });
            console.log(
              `⏹️ [LiveTracking] ========================================`,
            );
            return;
          }

          console.log(
            `👤 [LiveTracking] User ${userId} stopped tracking booking ${bookingId}`,
          );

          // Leave rooms
          socket.leave(`ride_${bookingId}`);
          socket.leave(`user_${userId}`);
          console.log(`⏹️ [LiveTracking] ✅ Left rooms`);

          // Remove from tracking
          if (rideTrackingRooms.has(bookingId)) {
            rideTrackingRooms.get(bookingId)?.delete(socket.id);
            console.log(
              `⏹️ [LiveTracking] ✅ Removed socket from tracking set`,
            );
            if (rideTrackingRooms.get(bookingId)?.size === 0) {
              rideTrackingRooms.delete(bookingId);
              console.log(
                `⏹️ [LiveTracking] ✅ Cleaned up tracking set for booking ${bookingId}`,
              );
            }
          }

          console.log(`⏹️ [LiveTracking] 📤 EMITTING: customer:track:stopped`);
          socket.emit("customer:track:stopped", {
            success: true,
            message: "Stopped tracking",
            event: "customer:track:stopped",
          });
          console.log(`⏹️ [LiveTracking] ✅ customer:track:stopped sent`);
          console.log(
            `⏹️ [LiveTracking] ========================================`,
          );
        } catch (error) {
          console.error("❌ [LiveTracking] Error stopping tracking:", error);
          console.log(
            `⏹️ [LiveTracking] ========================================`,
          );
        }
      },
    );

    // ============================================================
    // 6. DISCONNECT: Clean up
    // ============================================================
    socket.on("disconnect", async () => {
      console.log(`🔌 [LiveTracking] ========================================`);
      console.log(`🔌 [LiveTracking] 📡 EVENT: disconnect`);
      console.log(`🔌 [LiveTracking] 📍 Socket ID: ${socket.id}`);
      console.log(`🔌 [LiveTracking] 📍 Transport: ${socket.conn.transport}`);

      try {
        // Find and clean up any active tracking for this socket
        for (const [bookingId, sockets] of rideTrackingRooms) {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id);
            console.log(
              `🔌 [LiveTracking] ✅ Removed socket from booking ${bookingId}`,
            );
            if (sockets.size === 0) {
              rideTrackingRooms.delete(bookingId);
              console.log(
                `🔌 [LiveTracking] ✅ Cleaned up tracking for booking ${bookingId}`,
              );
            }
            break;
          }
        }

        // Find if this was a driver and clean up
        const userId = socket.data?.userId;
        if (userId) {
          console.log(
            `🔌 [LiveTracking] 🔍 Checking if ${userId} was a driver...`,
          );
          const activeQuoteId = driverRideMap.get(userId);
          if (activeQuoteId) {
            console.log(
              `🔌 [LiveTracking] 🚗 Driver ${userId} disconnected from ride ${activeQuoteId}`,
            );
            driverRideMap.delete(userId);
            driverLocationCache.delete(userId);
            console.log(`🔌 [LiveTracking] 🧹 Cleaned up driver ${userId}`);
          }
        }

        console.log(`🔌 [LiveTracking] ✅ Cleanup completed for ${socket.id}`);
        console.log(
          `🔌 [LiveTracking] ========================================`,
        );
      } catch (error) {
        console.error("❌ [LiveTracking] Error during disconnect:", error);
        console.log(
          `🔌 [LiveTracking] ========================================`,
        );
      }
    });

    // ============================================================
    // 7. PING/PONG for connection health
    // ============================================================
    socket.on("ping", () => {
      console.log(`💓 [LiveTracking] 📡 EVENT: ping from ${socket.id}`);
      socket.emit("pong");
      console.log(`💓 [LiveTracking] 📤 EMITTING: pong to ${socket.id}`);
    });

    console.log(
      `🔌 [LiveTracking] ✅ All event listeners registered for ${socket.id}`,
    );
  });
};

export const getCachedDriverLocation = (driverId: string) => {
  console.log(
    `📦 [LiveTracking] getCachedDriverLocation called for ${driverId}`,
  );
  const location = driverLocationCache.get(driverId) || null;
  console.log(
    `📦 [LiveTracking] ${location ? "✅ Found" : "❌ Not found"} location for ${driverId}`,
  );
  return location;
};

export const isDriverLiveTracking = (driverId: string) => {
  const isTracking = driverRideMap.has(driverId);
  console.log(
    `🔍 [LiveTracking] isDriverLiveTracking(${driverId}) = ${isTracking}`,
  );
  return isTracking;
};

export const cleanupLiveTracking = () => {
  console.log(`🧹 [LiveTracking] ========================================`);
  console.log(`🧹 [LiveTracking] 🧹 CLEANUP STARTED`);
  console.log(
    `🧹 [LiveTracking] 📦 rideTrackingRooms size: ${rideTrackingRooms.size}`,
  );
  console.log(`🧹 [LiveTracking] 📦 driverRideMap size: ${driverRideMap.size}`);
  console.log(
    `🧹 [LiveTracking] 📦 driverLocationCache size: ${driverLocationCache.size}`,
  );

  rideTrackingRooms.clear();
  driverRideMap.clear();
  driverLocationCache.clear();

  console.log(`🧹 [LiveTracking] ✅ All tracking data cleaned up`);
  console.log(`🧹 [LiveTracking] ========================================`);
};
