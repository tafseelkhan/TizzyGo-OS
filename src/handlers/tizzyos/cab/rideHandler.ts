// socket/handlers.ts

import { Server, Socket } from "socket.io";
import { RideSocketService } from "../../../socket/tizzyos/cab/rideSocket";
import { RideLocationService } from "../../../services/tizzyos/cab/rideLocationService";
import { RideDispatchService } from "../../../services/tizzyos/cab/rideDispatchService";

export const socketHandlers = (io: Server): void => {
  const socketService = RideSocketService.getInstance();
  socketService.initialize(io);

  const locationService = new RideLocationService();

  io.on("connection", (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // =====================================================
    // authenticate
    //
    // Purpose:
    // Authenticates the user and establishes socket connection.
    //
    // Called By:
    // Customer Frontend, Driver App
    // =====================================================

    socket.on(
      "authenticate",
      async (data: { userId: string; userType: "customer" | "driver" }) => {
        try {
          const { userId, userType } = data;

          if (userType === "driver") {
            const RideDriverStatus =
              require("../../../models/tizzyos/cab/rideDriverStatus").default;
            await RideDriverStatus.findOneAndUpdate(
              { userId },
              { isOnline: true, socketId: socket.id, lastSeen: new Date() },
              { upsert: true, new: true },
            );
          }

          socketService["handleAuthentication"](socket, data);
          socket.emit("auth-success", {
            message: "Authenticated successfully",
          });
        } catch (error) {
          console.error("Authentication failed:", error);
          socket.emit("auth-error", { message: "Authentication failed" });
        }
      },
    );

    // =====================================================
    // driver-location-update
    //
    // Purpose:
    // Updates driver's real-time location.
    //
    // Called By:
    // Driver App
    // =====================================================

    socket.on("driver-location-update", async (data) => {
      try {
        const userId = socketService["socketRooms"].get(socket.id);
        if (!userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }

        await locationService.updateDriverLocation({ ...data, userId });

        // Broadcast to customers tracking this driver
        // Implementation depends on tracking service
      } catch (error) {
        console.error("Driver location update failed:", error);
        socket.emit("error", { message: "Failed to update location" });
      }
    });

    // =====================================================
    // driver-status-update
    //
    // Purpose:
    // Updates driver's online/available status.
    //
    // Called By:
    // Driver App
    // =====================================================

    socket.on("driver-status-update", async (data) => {
      try {
        const userId = socketService["socketRooms"].get(socket.id);
        if (!userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }

        const RideDriverStatus =
          require("../../../models/tizzyos/cab/rideDriverStatus").default;
        await RideDriverStatus.findOneAndUpdate(
          { userId },
          { isAvailable: data.isAvailable, lastSeen: new Date() },
          { upsert: true, new: true },
        );

        socket.emit("status-updated", {
          isAvailable: data.isAvailable,
          message: "Status updated successfully",
        });
      } catch (error) {
        console.error("Driver status update failed:", error);
        socket.emit("error", { message: "Failed to update status" });
      }
    });

    // =====================================================
    // customer-location-update
    //
    // Purpose:
    // Updates customer's real-time location.
    //
    // Called By:
    // Customer Frontend
    // =====================================================

    socket.on("customer-location-update", async (data) => {
      try {
        const userId = socketService["socketRooms"].get(socket.id);
        if (!userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }
        // Store customer location for pickup estimation
        console.log(`Customer location update: ${userId}`, data);
      } catch (error) {
        console.error("Customer location update failed:", error);
        socket.emit("error", { message: "Failed to update location" });
      }
    });

    // =====================================================
    // driver-response
    //
    // Purpose:
    // Handles driver accept/reject response.
    //
    // Called By:
    // Driver App
    // =====================================================

    socket.on(
      "driver-response",
      async (data: { requestId: string; action: "accept" | "reject" }) => {
        try {
          const userId = socketService["socketRooms"].get(socket.id);
          if (!userId) {
            socket.emit("error", { message: "Not authenticated" });
            return;
          }

          const RideRequest =
            require("../../../models/tizzyos/cab/rideRequest").default;
          const request = await RideRequest.findById(data.requestId);

          if (!request) {
            socket.emit("error", { message: "Request not found" });
            return;
          }

          if (request.status !== "pending") {
            socket.emit("error", { message: "Request is no longer pending" });
            return;
          }

          if (request.driverId.toString() !== userId) {
            socket.emit("error", {
              message: "Not authorized for this request",
            });
            return;
          }

          const dispatchService = new RideDispatchService();

          if (data.action === "accept") {
            await dispatchService.handleDriverAccept(
              request.bookingId,
              data.requestId,
            );
            socket.emit("response-processed", {
              action: "accept",
              message: "Ride accepted successfully",
            });
          } else if (data.action === "reject") {
            await dispatchService.handleDriverReject(
              request.bookingId,
              data.requestId,
            );
            socket.emit("response-processed", {
              action: "reject",
              message: "Ride rejected successfully",
            });
          }
        } catch (error) {
          console.error("Driver response failed:", error);
          socket.emit("error", { message: "Failed to process response" });
        }
      },
    );

    // =====================================================
    // disconnect
    //
    // Purpose:
    // Handles socket disconnection.
    //
    // Called By:
    // Socket.IO automatically
    // =====================================================

    socket.on("disconnect", async () => {
      const userId = socketService["socketRooms"].get(socket.id);
      if (userId) {
        const RideDriverStatus =
          require("../../../models/tizzyos/cab/rideDriverStatus").default;
        await RideDriverStatus.findOneAndUpdate(
          { userId },
          { isOnline: false, lastSeen: new Date() },
        );

        socketService["handleDisconnect"](socket);
        console.log(`User ${userId} disconnected`);
      }
    });
  });
};
