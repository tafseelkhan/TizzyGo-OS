// handlers/tizzyos/cab/rideHandler.ts

import { Server, Socket } from "socket.io";
import driverStatusService from "../../../services/tizzyos/cab/rideOnlineDriverService";

export const rideDriverOnlineOffline = (io: Server) => {
  io.on("connection", async (socket: Socket) => {
    console.log(`🔌 New client connected: ${socket.id}`);

    // ✅ Register driver with socket ID
    socket.on("driver:register", async (data: { userId: string }) => {
      try {
        const { userId } = data;

        if (!userId) {
          socket.emit("driver:error", { message: "userId is required" });
          return;
        }

        // Update socket ID in database
        await driverStatusService.updateSocketId(userId, socket.id);

        // Join driver's personal room
        socket.join(`driver_${userId}`);

        // Get current status
        const status = await driverStatusService.getDriverStatus(userId);

        socket.emit("driver:registered", {
          success: true,
          message: "Driver registered successfully",
          data: status,
        });

        console.log(`🚗 Driver ${userId} registered with socket ${socket.id}`);
      } catch (error) {
        console.error("Error registering driver:", error);
        socket.emit("driver:error", {
          message:
            error instanceof Error ? error.message : "Registration failed",
        });
      }
    });

    // ✅ Handle disconnection
    socket.on("disconnect", async () => {
      try {
        // Find driver by socket ID
        const driver = await driverStatusService.getDriverBySocketId(socket.id);

        if (driver) {
          // Clear socket ID but keep online status
          await driverStatusService.clearSocketId(driver.userId.toString());

          // Notify others that driver disconnected
          io.emit("driver:disconnected", {
            userId: driver.userId,
            socketId: socket.id,
            timestamp: new Date().toISOString(),
          });

          console.log(
            `🔌 Driver ${driver.userId} disconnected (socket: ${socket.id})`,
          );
        }
      } catch (error) {
        console.error("Error handling disconnect:", error);
      }
    });
  });
};
