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

    // Authenticate user
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

          // Handle authentication through socket service
          socketService["handleAuthentication"](socket, data);
        } catch (error) {
          console.error("Authentication failed:", error);
          socket.emit("auth-error", { message: "Authentication failed" });
        }
      },
    );

    // Driver location update
    socket.on("driver-location-update", async (data) => {
      try {
        const userId = socketService["socketRooms"].get(socket.id);
        if (!userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }

        await locationService.updateDriverLocation({ ...data, userId });
      } catch (error) {
        console.error("Driver location update failed:", error);
        socket.emit("error", { message: "Failed to update location" });
      }
    });

    // Driver status update
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
      } catch (error) {
        console.error("Driver status update failed:", error);
        socket.emit("error", { message: "Failed to update status" });
      }
    });

    // Customer location update
    socket.on("customer-location-update", async (data) => {
      try {
        const userId = socketService["socketRooms"].get(socket.id);
        if (!userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }
        console.log(`Customer location update: ${userId}`, data);
      } catch (error) {
        console.error("Customer location update failed:", error);
        socket.emit("error", { message: "Failed to update location" });
      }
    });

    // Driver response (accept/reject)
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
          } else if (data.action === "reject") {
            await dispatchService.handleDriverReject(
              request.bookingId,
              data.requestId,
            );
          }
        } catch (error) {
          console.error("Driver response failed:", error);
          socket.emit("error", { message: "Failed to process response" });
        }
      },
    );

    // Disconnect
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
