// handlers/tizzyos/cab/rideLiveTrackingHandler.ts

import { Server, Socket } from "socket.io";
import { getRideLiveTracking } from "../../../services/tizzyos/cab/rideLiveTrackingService";

// Store active ride tracking data
const rideTrackingRooms = new Map<string, Set<string>>(); // bookingId -> Set of customer socket IDs
const driverRideMap = new Map<string, string>(); // driverId -> bookingId
const driverLocationCache = new Map<string, any>(); // driverId -> last known location

// ============================================================
// ERROR MESSAGES FOR SOCKET
// ============================================================

const SOCKET_ERROR_MESSAGES: Record<string, string> = {
  BOOKING_ID_REQUIRED: "Booking ID is required",
  TRACKING_ID_REQUIRED: "Tracking ID is required",
  BOOKING_NOT_FOUND: "Booking not found",
  UNAUTHORIZED: "You are not authorized to track this ride",
  NO_DRIVER_ASSIGNED: "No driver assigned to this ride",
  RIDE_NOT_TRACKABLE: "Ride is not in a trackable state",
  RIDE_ALREADY_COMPLETED: "This ride has already been completed or cancelled",
};

export const rideLiveTrackingHandler = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    console.log(`🔌 [LiveTracking] New client connected: ${socket.id}`);

    // ============================================================
    // 1. DRIVER: Start sending live location
    // ============================================================
    socket.on(
      "driver:live:start",
      async (data: {
        driverId: string;
        rideId: string;
        latitude: number;
        longitude: number;
        heading?: number;
        speed?: number;
      }) => {
        try {
          const { driverId, rideId, latitude, longitude, heading, speed } =
            data;

          if (!driverId || !rideId) {
            socket.emit("driver:live:error", {
              message: "driverId and rideId are required",
            });
            return;
          }

          // ✅ SECURITY: Verify driver is authenticated
          const authenticatedUserId = (socket as any).data?.userId;
          if (authenticatedUserId && authenticatedUserId !== driverId) {
            socket.emit("driver:live:error", {
              message: "Unauthorized: Driver ID mismatch",
            });
            return;
          }

          console.log(
            `🚗 [LiveTracking] Driver ${driverId} started live tracking for ride ${rideId}`,
          );

          // Store mapping
          driverRideMap.set(driverId, rideId);

          // Join driver's room
          socket.join(`ride_${rideId}`);
          socket.join(`driver_${driverId}`);

          // Cache initial location
          driverLocationCache.set(driverId, {
            latitude,
            longitude,
            heading: heading || 0,
            speed: speed || 0,
            timestamp: new Date().toISOString(),
          });

          // Send initial location to all customers tracking this ride
          io.to(`ride_${rideId}`).emit("driver:live:location", {
            driverId,
            rideId,
            latitude,
            longitude,
            heading: heading || 0,
            speed: speed || 0,
            timestamp: new Date().toISOString(),
          });

          socket.emit("driver:live:started", {
            success: true,
            message: "Live tracking started",
            rideId,
          });
        } catch (error) {
          console.error(
            "❌ [LiveTracking] Error starting live tracking:",
            error,
          );
          socket.emit("driver:live:error", {
            message:
              error instanceof Error
                ? error.message
                : "Failed to start live tracking",
          });
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
        rideId?: string;
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
            rideId,
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

          if (!driverId) {
            socket.emit("driver:live:error", {
              message: "driverId is required",
            });
            return;
          }

          // Get rideId from map if not provided
          const activeRideId = rideId || driverRideMap.get(driverId);

          if (!activeRideId) {
            // Driver not in any active ride
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

          // Optional fields
          if (bearing !== undefined) cacheData.bearing = bearing;
          if (altitude !== undefined) cacheData.altitude = altitude;
          if (batteryLevel !== undefined) cacheData.batteryLevel = batteryLevel;
          if (networkType) cacheData.networkType = networkType;
          if (isMockLocation !== undefined)
            cacheData.isMockLocation = isMockLocation;
          if (provider) cacheData.provider = provider;

          driverLocationCache.set(driverId, cacheData);

          // Build broadcast payload
          const broadcastPayload: any = {
            driverId,
            rideId: activeRideId,
            latitude,
            longitude,
            heading: heading || 0,
            speed: speed || 0,
            timestamp: new Date().toISOString(),
          };

          // Add optional fields to broadcast
          if (accuracy !== undefined) broadcastPayload.accuracy = accuracy;
          if (bearing !== undefined) broadcastPayload.bearing = bearing;
          if (altitude !== undefined) broadcastPayload.altitude = altitude;

          // Broadcast to all customers in this ride room
          io.to(`ride_${activeRideId}`).emit(
            "driver:live:location",
            broadcastPayload,
          );

          // Also send to driver for acknowledgment
          socket.emit("driver:live:ack", {
            success: true,
            timestamp: new Date().toISOString(),
          });
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
      async (data: { driverId: string; rideId?: string }) => {
        try {
          const { driverId, rideId } = data;

          if (!driverId) {
            socket.emit("driver:live:error", {
              message: "driverId is required",
            });
            return;
          }

          const activeRideId = rideId || driverRideMap.get(driverId);

          if (activeRideId) {
            // Notify customers that driver stopped tracking
            io.to(`ride_${activeRideId}`).emit("driver:live:stopped", {
              driverId,
              rideId: activeRideId,
              message: "Driver stopped sharing location",
              timestamp: new Date().toISOString(),
            });

            // Clean up
            driverRideMap.delete(driverId);
            driverLocationCache.delete(driverId);

            // Leave rooms
            socket.leave(`ride_${activeRideId}`);
            socket.leave(`driver_${driverId}`);
          }

          socket.emit("driver:live:stopped", {
            success: true,
            message: "Live tracking stopped",
          });

          console.log(
            `🚗 [LiveTracking] Driver ${driverId} stopped live tracking`,
          );
        } catch (error) {
          console.error(
            "❌ [LiveTracking] Error stopping live tracking:",
            error,
          );
        }
      },
    );

    // ============================================================
    // 4. CUSTOMER/DRIVER: Start tracking (only bookingId + trackingId)
    // ============================================================
    socket.on(
      "customer:track:start",
      async (data: { bookingId: string; trackingId: string }) => {
        try {
          const { bookingId, trackingId } = data;

          // ============================================================
          // VALIDATE INPUT
          // ============================================================
          if (!bookingId || bookingId.trim() === "") {
            socket.emit("customer:track:error", {
              message: "Booking ID is required",
            });
            return;
          }

          if (!trackingId || trackingId.trim() === "") {
            socket.emit("customer:track:error", {
              message: "Tracking ID is required",
            });
            return;
          }

          // ============================================================
          // GET AUTHENTICATED USER ID FROM SOCKET
          // ============================================================
          const userId = (socket as any).data?.userId;

          if (!userId) {
            socket.emit("customer:track:error", {
              message: "Unauthorized: Please login again",
            });
            return;
          }

          console.log(
            `👤 [LiveTracking] User ${userId} started tracking booking ${bookingId} with tracking ${trackingId}`,
          );

          // ============================================================
          // CALL SERVICE - validates booking + tracking + authorization
          // Service will verify if user is Customer OR Driver
          // ============================================================
          const trackingData = await getRideLiveTracking({
            bookingId,
            trackingId,
            userId,
            includeCachedLocation: false,
          });

          // ============================================================
          // GET CACHED LOCATION FOR DRIVER
          // ============================================================
          const driverId = trackingData.driver.userId;
          const cachedLoc = driverLocationCache.get(driverId);

          let cachedLocData = null;
          if (cachedLoc) {
            cachedLocData = {
              latitude: cachedLoc.latitude,
              longitude: cachedLoc.longitude,
              heading: cachedLoc.heading || 0,
              speed: cachedLoc.speed || 0,
              timestamp: cachedLoc.timestamp || new Date().toISOString(),
            };
          }

          // If cached location exists, update tracking data with it
          if (cachedLocData) {
            trackingData.driver.cachedLocation = cachedLocData;
          }

          // ============================================================
          // JOIN ROOMS (Only after successful validation)
          // ============================================================
          socket.join(`ride_${bookingId}`);
          socket.join(`user_${userId}`);

          // Store tracking
          if (!rideTrackingRooms.has(bookingId)) {
            rideTrackingRooms.set(bookingId, new Set());
          }
          rideTrackingRooms.get(bookingId)?.add(socket.id);

          // ============================================================
          // SEND SUCCESS RESPONSE
          // ============================================================
          socket.emit("customer:track:success", {
            success: true,
            message: "Now tracking driver",
            data: trackingData,
          });

          // ============================================================
          // SEND CACHED LOCATION IF AVAILABLE
          // ============================================================
          if (cachedLoc) {
            socket.emit("driver:live:location", {
              driverId,
              rideId: bookingId,
              latitude: cachedLoc.latitude,
              longitude: cachedLoc.longitude,
              heading: cachedLoc.heading || 0,
              speed: cachedLoc.speed || 0,
              timestamp: cachedLoc.timestamp || new Date().toISOString(),
              fromCache: true,
            });
          }
        } catch (error) {
          console.error("❌ [LiveTracking] Error tracking driver:", error);

          // Handle known error types
          let errorMessage = "Failed to track driver";
          if (error instanceof Error) {
            const errorKey = error.message;
            errorMessage = SOCKET_ERROR_MESSAGES[errorKey] || error.message;
          }

          socket.emit("customer:track:error", {
            message: errorMessage,
          });
        }
      },
    );

    // ============================================================
    // 5. CUSTOMER: Stop tracking
    // ============================================================
    socket.on(
      "customer:track:stop",
      async (data: { bookingId: string; trackingId?: string }) => {
        try {
          const { bookingId, trackingId } = data;

          if (!bookingId || bookingId.trim() === "") {
            socket.emit("customer:track:error", {
              message: "Booking ID is required",
            });
            return;
          }

          const userId = (socket as any).data?.userId;

          if (!userId) {
            socket.emit("customer:track:error", {
              message: "Unauthorized",
            });
            return;
          }

          console.log(
            `👤 [LiveTracking] User ${userId} stopped tracking booking ${bookingId}`,
          );

          // Leave rooms
          socket.leave(`ride_${bookingId}`);
          socket.leave(`user_${userId}`);

          // Remove from tracking
          if (rideTrackingRooms.has(bookingId)) {
            rideTrackingRooms.get(bookingId)?.delete(socket.id);
            if (rideTrackingRooms.get(bookingId)?.size === 0) {
              rideTrackingRooms.delete(bookingId);
            }
          }

          socket.emit("customer:track:stopped", {
            success: true,
            message: "Stopped tracking",
          });
        } catch (error) {
          console.error("❌ [LiveTracking] Error stopping tracking:", error);
        }
      },
    );

    // ============================================================
    // 6. DISCONNECT: Clean up
    // ============================================================
    socket.on("disconnect", async () => {
      try {
        console.log(`🔌 [LiveTracking] Client disconnected: ${socket.id}`);

        // Find and clean up any active tracking for this socket
        for (const [bookingId, sockets] of rideTrackingRooms) {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id);
            if (sockets.size === 0) {
              rideTrackingRooms.delete(bookingId);
            }
            break;
          }
        }

        // Find if this was a driver and clean up safely
        for (const [driverId, bookingId] of driverRideMap) {
          const driverRoom = `driver_${driverId}`;
          const room = io.sockets.adapter.rooms.get(driverRoom);
          if (!room || !room.has(socket.id)) {
            // Driver might have disconnected
            // Keep mapping for now, cleanup on timeout or reconnect
          }
        }
      } catch (error) {
        console.error("❌ [LiveTracking] Error during disconnect:", error);
      }
    });
  });
};

// ============================================================
// EXPORT: Utilities
// ============================================================
export const getCachedDriverLocation = (driverId: string) => {
  return driverLocationCache.get(driverId) || null;
};

export const isDriverLiveTracking = (driverId: string) => {
  return driverRideMap.has(driverId);
};

export const cleanupLiveTracking = () => {
  rideTrackingRooms.clear();
  driverRideMap.clear();
  driverLocationCache.clear();
  console.log("🧹 [LiveTracking] Cleaned up all tracking data");
};
