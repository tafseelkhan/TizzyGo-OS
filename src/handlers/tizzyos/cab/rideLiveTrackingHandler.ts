// handlers/tizzyos/cab/rideLiveTrackingHandler.ts

import { Server, Socket } from "socket.io";

// Store active ride tracking data
const rideTrackingRooms = new Map<string, Set<string>>(); // rideId -> Set of customer socket IDs
const driverRideMap = new Map<string, string>(); // driverId -> rideId
const driverLocationCache = new Map<string, any>(); // driverId -> last known location

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

          // Update cache
          driverLocationCache.set(driverId, {
            latitude,
            longitude,
            heading: heading || 0,
            speed: speed || 0,
            accuracy: accuracy || 0,
            timestamp: new Date().toISOString(),
          });

          // Broadcast to all customers in this ride room
          io.to(`ride_${activeRideId}`).emit("driver:live:location", {
            driverId,
            rideId: activeRideId,
            latitude,
            longitude,
            heading: heading || 0,
            speed: speed || 0,
            timestamp: new Date().toISOString(),
          });

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
    // 4. CUSTOMER: Start tracking a driver
    // ============================================================
    socket.on(
      "customer:track:start",
      async (data: {
        customerId: string;
        driverId: string;
        rideId: string;
      }) => {
        try {
          const { customerId, driverId, rideId } = data;

          if (!customerId || !driverId || !rideId) {
            socket.emit("customer:track:error", {
              message: "Missing required fields",
            });
            return;
          }

          console.log(
            `👤 [LiveTracking] Customer ${customerId} started tracking driver ${driverId} for ride ${rideId}`,
          );

          // Join ride room
          socket.join(`ride_${rideId}`);
          socket.join(`customer_${customerId}`);

          // Store tracking
          if (!rideTrackingRooms.has(rideId)) {
            rideTrackingRooms.set(rideId, new Set());
          }
          rideTrackingRooms.get(rideId)?.add(socket.id);

          // Send current cached location if available
          const cachedLocation = driverLocationCache.get(driverId);
          if (cachedLocation) {
            socket.emit("driver:live:location", {
              driverId,
              rideId,
              ...cachedLocation,
            });
          } else {
            // If no cached location, try to get from database (optional)
            // You can fetch from RideDriverLocation here
          }

          socket.emit("customer:track:success", {
            success: true,
            message: "Now tracking driver",
            data: { driverId, rideId },
          });
        } catch (error) {
          console.error("❌ [LiveTracking] Error tracking driver:", error);
          socket.emit("customer:track:error", {
            message:
              error instanceof Error ? error.message : "Failed to track driver",
          });
        }
      },
    );

    // ============================================================
    // 5. CUSTOMER: Stop tracking
    // ============================================================
    socket.on(
      "customer:track:stop",
      async (data: { customerId: string; rideId: string }) => {
        try {
          const { customerId, rideId } = data;

          if (!customerId || !rideId) {
            socket.emit("customer:track:error", {
              message: "Missing required fields",
            });
            return;
          }

          console.log(
            `👤 [LiveTracking] Customer ${customerId} stopped tracking ride ${rideId}`,
          );

          // Leave rooms
          socket.leave(`ride_${rideId}`);
          socket.leave(`customer_${customerId}`);

          // Remove from tracking
          if (rideTrackingRooms.has(rideId)) {
            rideTrackingRooms.get(rideId)?.delete(socket.id);
            if (rideTrackingRooms.get(rideId)?.size === 0) {
              rideTrackingRooms.delete(rideId);
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
        for (const [rideId, sockets] of rideTrackingRooms) {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id);
            if (sockets.size === 0) {
              rideTrackingRooms.delete(rideId);
            }
            break;
          }
        }

        // Find if this was a driver
        for (const [driverId, rideId] of driverRideMap) {
          // Check if this driver's socket is the one disconnecting
          // We can't directly map socket to driver here, but we can check
          // by seeing if the driver is in any room
          const driverRoom = `driver_${driverId}`;
          const room = io.sockets.adapter.rooms.get(driverRoom);
          if (!room || !room.has(socket.id)) {
            // Driver might have disconnected
            // We'll keep the mapping for now, cleanup on timeout
          }
        }
      } catch (error) {
        console.error("❌ [LiveTracking] Error during disconnect:", error);
      }
    });
  });
};

// ============================================================
// EXPORT: Get cached driver location (for API use)
// ============================================================
export const getCachedDriverLocation = (driverId: string) => {
  return driverLocationCache.get(driverId) || null;
};

// ============================================================
// EXPORT: Check if driver is live tracking
// ============================================================
export const isDriverLiveTracking = (driverId: string) => {
  return driverRideMap.has(driverId);
};

// ============================================================
// EXPORT: Cleanup on server shutdown
// ============================================================
export const cleanupLiveTracking = () => {
  rideTrackingRooms.clear();
  driverRideMap.clear();
  driverLocationCache.clear();
  console.log("🧹 [LiveTracking] Cleaned up all tracking data");
};
