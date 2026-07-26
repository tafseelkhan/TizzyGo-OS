// socket/handlers.ts

import { Server, Socket } from "socket.io";
import { RideSocketService } from "../../../socket/tizzyos/cab/rideSocket";
import { RideLocationService } from "../../../services/tizzyos/cab/rideLocationService";
import { RideDispatchService } from "../../../services/tizzyos/cab/rideDispatchService";
import driverStatusService from "../../../services/tizzyos/cab/rideOnlineDriverService";

export const socketHandlers = (io: Server): void => {
  const socketService = RideSocketService.getInstance();
  socketService.initialize(io);

  const locationService = new RideLocationService();

  console.log("🔌 [BACKEND] Socket handlers initialized");

  io.on("connection", (socket: Socket) => {
    console.log(`🔌 [BACKEND] ========================================`);
    console.log(`🔌 [BACKEND] Socket connected: ${socket.id}`);
    console.log(`🔌 [BACKEND] ========================================`);

    // =====================================================
    // ✅ AUTHENTICATE
    // =====================================================
    socket.on(
      "authenticate",
      async (data: { userId: string; userType: "customer" | "driver" }) => {
        console.log(`🔐 [BACKEND] ========================================`);
        console.log(`🔐 [BACKEND] authenticate event received`);
        console.log(`🔐 [BACKEND] Socket ID: ${socket.id}`);
        console.log(`🔐 [BACKEND] Data:`, JSON.stringify(data, null, 2));

        try {
          const { userId, userType } = data;

          if (userType === "driver") {
            console.log(`🔐 [BACKEND] Driver authentication: ${userId}`);
            const RideDriverStatus =
              require("../../../models/tizzyos/cab/rideDriverStatus").default;
            await RideDriverStatus.findOneAndUpdate(
              { userId },
              { isOnline: true, socketId: socket.id, lastSeen: new Date() },
              { upsert: true, new: true },
            );
            console.log(
              `🔐 [BACKEND] ✅ Driver status updated in DB: ${userId}`,
            );
          }

          socketService["handleAuthentication"](socket, data);
          socket.emit("auth-success", {
            message: "Authenticated successfully",
          });
          console.log(`🔐 [BACKEND] ✅ auth-success sent to ${socket.id}`);
        } catch (error) {
          console.error(`🔐 [BACKEND] ❌ Authentication failed:`, error);
          socket.emit("auth-error", { message: "Authentication failed" });
        }
        console.log(`🔐 [BACKEND] ========================================`);
      },
    );

    // =====================================================
    // ✅ JOIN/LEAVE BOOKING ROOM
    // =====================================================
    socket.on("join-booking-room", (data: { bookingId: string }) => {
      console.log(`📡 [BACKEND] ========================================`);
      console.log(`📡 [BACKEND] join-booking-room received`);
      console.log(`📡 [BACKEND] Socket ID: ${socket.id}`);
      console.log(`📡 [BACKEND] Booking ID: ${data.bookingId}`);

      const room = `booking_${data.bookingId}`;
      socket.join(room);
      console.log(`📡 [BACKEND] ✅ Socket ${socket.id} joined room: ${room}`);
      console.log(`📡 [BACKEND] ========================================`);
    });

    socket.on("leave-booking-room", (data: { bookingId: string }) => {
      console.log(`📡 [BACKEND] ========================================`);
      console.log(`📡 [BACKEND] leave-booking-room received`);
      console.log(`📡 [BACKEND] Socket ID: ${socket.id}`);
      console.log(`📡 [BACKEND] Booking ID: ${data.bookingId}`);

      const room = `booking_${data.bookingId}`;
      socket.leave(room);
      console.log(`📡 [BACKEND] ✅ Socket ${socket.id} left room: ${room}`);
      console.log(`📡 [BACKEND] ========================================`);
    });

    // =====================================================
    // ✅ DRIVER:REGISTER
    // =====================================================
    socket.on("driver:register", async (data: { userId: string }) => {
      console.log(`🚗 [BACKEND] ========================================`);
      console.log(`🚗 [BACKEND] driver:register received`);
      console.log(`🚗 [BACKEND] Socket ID: ${socket.id}`);
      console.log(`🚗 [BACKEND] Data:`, JSON.stringify(data, null, 2));

      try {
        const { userId } = data;

        if (!userId) {
          console.error(`❌ [BACKEND] No userId provided`);
          socket.emit("driver:error", {
            success: false,
            message: "userId is required",
          });
          return;
        }

        console.log(`🚗 [BACKEND] ✅ UserId received: ${userId}`);

        await driverStatusService.updateSocketId(userId, socket.id);
        socket.join(`driver_${userId}`);

        const status = await driverStatusService.getDriverStatus(userId);

        socket.emit("driver:registered", {
          success: true,
          message: "Driver registered successfully",
          data: status,
        });

        console.log(
          `🚗 [BACKEND] ✅ Driver ${userId} registered with socket ${socket.id}`,
        );
        console.log(`🚗 [BACKEND] ========================================`);
      } catch (error) {
        console.error(`❌ [BACKEND] Error registering driver:`, error);
        socket.emit("driver:error", {
          success: false,
          message: "Failed to register driver",
          error: error instanceof Error ? error.message : String(error),
        });
        console.log(`🚗 [BACKEND] ========================================`);
      }
    });

    // =====================================================
    // ✅ DRIVER:STATUS-CHANGED
    // =====================================================
    socket.on(
      "driver:status-changed",
      async (data: {
        userId: string;
        isOnline: boolean;
        isAvailable: boolean;
      }) => {
        console.log(`📊 [BACKEND] ========================================`);
        console.log(`📊 [BACKEND] driver:status-changed received`);
        console.log(`📊 [BACKEND] Socket ID: ${socket.id}`);
        console.log(`📊 [BACKEND] Data:`, JSON.stringify(data, null, 2));

        try {
          const { userId, isOnline, isAvailable } = data;

          if (!userId) {
            console.error(`❌ [BACKEND] No userId provided`);
            return;
          }

          const RideDriverStatus =
            require("../../../models/tizzyos/cab/rideDriverStatus").default;
          await RideDriverStatus.findOneAndUpdate(
            { userId },
            {
              userId: userId,
              isOnline: isOnline,
              isAvailable: isAvailable,
              socketId: socket.id,
              lastSeen: new Date(),
            },
            { upsert: true, new: true },
          );

          console.log(
            `📊 [BACKEND] ✅ Status updated: isOnline=${isOnline}, isAvailable=${isAvailable}`,
          );

          io.emit("driver:status-changed", {
            userId: userId,
            isOnline: isOnline,
            isAvailable: isAvailable,
            lastSeen: new Date().toISOString(),
          });

          console.log(`📊 [BACKEND] ✅ Status broadcasted`);
          console.log(`📊 [BACKEND] ========================================`);
        } catch (error) {
          console.error(`❌ [BACKEND] Error updating status:`, error);
          console.log(`📊 [BACKEND] ========================================`);
        }
      },
    );

    // =====================================================
    // ✅ DRIVER LOCATION UPDATE
    // =====================================================
    socket.on("driver-location-update", async (data) => {
      console.log(`📍 [BACKEND] ========================================`);
      console.log(`📍 [BACKEND] driver-location-update received`);
      console.log(`📍 [BACKEND] Socket ID: ${socket.id}`);

      try {
        const userId = socketService["socketRooms"].get(socket.id);
        if (!userId) {
          console.log(`📍 [BACKEND] ❌ User not authenticated`);
          socket.emit("error", { message: "Not authenticated" });
          return;
        }
        console.log(`📍 [BACKEND] ✅ User ID: ${userId}`);

        await locationService.updateDriverLocation({ ...data, userId });
        console.log(`📍 [BACKEND] ✅ Location updated for ${userId}`);
      } catch (error) {
        console.error(`📍 [BACKEND] ❌ Driver location update failed:`, error);
        socket.emit("error", { message: "Failed to update location" });
      }
      console.log(`📍 [BACKEND] ========================================`);
    });

    // =====================================================
    // ✅ DRIVER STATUS UPDATE
    // =====================================================
    socket.on("driver-status-update", async (data) => {
      console.log(`📊 [BACKEND] ========================================`);
      console.log(`📊 [BACKEND] driver-status-update received`);
      console.log(`📊 [BACKEND] Socket ID: ${socket.id}`);

      try {
        const userId = socketService["socketRooms"].get(socket.id);
        if (!userId) {
          console.log(`📊 [BACKEND] ❌ User not authenticated`);
          socket.emit("error", { message: "Not authenticated" });
          return;
        }
        console.log(`📊 [BACKEND] ✅ User ID: ${userId}`);

        const RideDriverStatus =
          require("../../../models/tizzyos/cab/rideDriverStatus").default;
        await RideDriverStatus.findOneAndUpdate(
          { userId },
          { isAvailable: data.isAvailable, lastSeen: new Date() },
          { upsert: true, new: true },
        );
        console.log(
          `📊 [BACKEND] ✅ Status updated for ${userId}: isAvailable=${data.isAvailable}`,
        );

        socket.emit("status-updated", {
          isAvailable: data.isAvailable,
          message: "Status updated successfully",
        });
        console.log(`📊 [BACKEND] ✅ status-updated sent to ${socket.id}`);
      } catch (error) {
        console.error(`📊 [BACKEND] ❌ Driver status update failed:`, error);
        socket.emit("error", { message: "Failed to update status" });
      }
      console.log(`📊 [BACKEND] ========================================`);
    });

    // =====================================================
    // ✅ DRIVER RESPONSE (ACCEPT/REJECT)
    // =====================================================
    socket.on(
      "driver-response",
      async (data: { requestId: string; action: "accept" | "reject" }) => {
        console.log(`🎯 [BACKEND] ========================================`);
        console.log(`🎯 [BACKEND] driver-response received`);
        console.log(`🎯 [BACKEND] Socket ID: ${socket.id}`);
        console.log(`🎯 [BACKEND] Action: ${data.action}`);
        console.log(`🎯 [BACKEND] Request ID: ${data.requestId}`);

        try {
          const userId = socketService["socketRooms"].get(socket.id);
          if (!userId) {
            console.log(`🎯 [BACKEND] ❌ User not authenticated`);
            socket.emit("error", { message: "Not authenticated" });
            return;
          }
          console.log(`🎯 [BACKEND] ✅ User ID: ${userId}`);

          const RideRequest =
            require("../../../models/tizzyos/cab/rideRequest").default;
          const request = await RideRequest.findById(data.requestId);

          if (!request) {
            console.log(`🎯 [BACKEND] ❌ Request not found: ${data.requestId}`);
            socket.emit("error", { message: "Request not found" });
            return;
          }

          console.log(`🎯 [BACKEND] Request status: ${request.status}`);
          console.log(`🎯 [BACKEND] Request driverId: ${request.driverId}`);
          console.log(`🎯 [BACKEND] UserId: ${userId}`);

          if (request.status !== "pending") {
            console.log(
              `🎯 [BACKEND] ❌ Request not pending: ${request.status}`,
            );
            socket.emit("error", { message: "Request is no longer pending" });
            return;
          }

          if (request.driverId.toString() !== userId) {
            console.log(`🎯 [BACKEND] ❌ Unauthorized: driver mismatch`);
            socket.emit("error", {
              message: "Not authorized for this request",
            });
            return;
          }

          const dispatchService = new RideDispatchService();

          if (data.action === "accept") {
            console.log(`🎯 [BACKEND] 🚗 Driver ACCEPTING ride`);
            await dispatchService.handleDriverAccept(
              request.bookingId,
              data.requestId,
            );
            console.log(`🎯 [BACKEND] ✅ Ride accepted successfully`);
            socket.emit("response-processed", {
              action: "accept",
              message: "Ride accepted successfully",
            });
          } else if (data.action === "reject") {
            console.log(`🎯 [BACKEND] 🚗 Driver REJECTING ride`);
            await dispatchService.handleDriverReject(
              request.bookingId,
              data.requestId,
            );
            console.log(`🎯 [BACKEND] ✅ Ride rejected successfully`);
            socket.emit("response-processed", {
              action: "reject",
              message: "Ride rejected successfully",
            });
          }
        } catch (error) {
          console.error(`🎯 [BACKEND] ❌ Driver response failed:`, error);
          socket.emit("error", { message: "Failed to process response" });
        }
        console.log(`🎯 [BACKEND] ========================================`);
      },
    );

    // =====================================================
    // ✅ TEST EVENT
    // =====================================================
    socket.on("test-ride-request", async (data: any) => {
      console.log(`🧪 [BACKEND] ========================================`);
      console.log(`🧪 [BACKEND] TEST RIDE REQUEST received`);
      console.log(`🧪 [BACKEND] Socket ID: ${socket.id}`);
      console.log(`🧪 [BACKEND] Data:`, JSON.stringify(data, null, 2));

      io.emit("new-ride-request", {
        requestId: "test_req_" + Date.now(),
        bookingId: "TEST-BOOKING-001",
        fare: 100,
        pickup: {
          address: "Test Pickup Location",
          latitude: 28.61,
          longitude: 77.2,
        },
        destination: {
          address: "Test Drop Location",
          latitude: 28.7,
          longitude: 77.1,
        },
        distance: 10.5,
        isRetry: false,
        batchNumber: 1,
        expiresAt: new Date(Date.now() + 20000).toISOString(),
      });
      console.log(`🧪 [BACKEND] ✅ Test ride request broadcasted!`);
      console.log(`🧪 [BACKEND] ========================================`);
    });

    // =====================================================
    // ✅ DISCONNECT
    // =====================================================
    socket.on("disconnect", async () => {
      console.log(`🔌 [BACKEND] ========================================`);
      console.log(`🔌 [BACKEND] Socket disconnected: ${socket.id}`);

      try {
        const driver = await driverStatusService.getDriverBySocketId(socket.id);

        if (driver) {
          const userId = driver.userId.toString();
          console.log(`🔌 [BACKEND] Driver ${userId} disconnected`);

          await driverStatusService.clearSocketId(userId);

          const RideDriverStatus =
            require("../../../models/tizzyos/cab/rideDriverStatus").default;
          await RideDriverStatus.findOneAndUpdate(
            { userId: userId },
            {
              isOnline: false,
              socketId: null,
              lastSeen: new Date(),
            },
            { new: true },
          );

          console.log(`🔌 [BACKEND] ✅ Driver ${userId} set to offline`);
        } else {
          console.log(
            `🔌 [BACKEND] ⚠️ No driver found for socket: ${socket.id}`,
          );
        }
      } catch (error) {
        console.error(`🔌 [BACKEND] ❌ Disconnect error:`, error);
      }

      console.log(`🔌 [BACKEND] ========================================`);
    });

    // =====================================================
    // ✅ CUSTOMER LOCATION UPDATE
    // =====================================================
    socket.on("customer-location-update", async (data) => {
      console.log(`👤 [BACKEND] customer-location-update received`);
      console.log(`👤 [BACKEND] Socket ID: ${socket.id}`);

      try {
        const userId = socketService["socketRooms"].get(socket.id);
        if (!userId) {
          console.log(`👤 [BACKEND] ❌ User not authenticated`);
          socket.emit("error", { message: "Not authenticated" });
          return;
        }
        console.log(`👤 [BACKEND] Customer location update: ${userId}`, data);
      } catch (error) {
        console.error(
          `👤 [BACKEND] ❌ Customer location update failed:`,
          error,
        );
        socket.emit("error", { message: "Failed to update location" });
      }
    });
  });
};
