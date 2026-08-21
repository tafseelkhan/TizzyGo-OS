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

        console.log(`🚗 [Socket] Driver registering: ${userId} (${socket.id})`);

        // ✅ Update socket ID ONLY - preserve isOnline and isAvailable
        await driverStatusService.updateSocketId(userId, socket.id);

        // Join driver's personal room
        socket.join(`driver_${userId}`);

        // Get current status
        const status = await driverStatusService.getDriverStatus(userId);

        console.log(`✅ [Socket] Driver registered: ${userId}`);
        console.log(`   isOnline: ${status.isOnline}, isAvailable: ${status.isAvailable}`);
        console.log(`   socketId: ${socket.id}`);

        socket.emit("driver:registered", {
          success: true,
          message: "Driver registered successfully",
          data: status,
        });
      } catch (error) {
        console.error("Error registering driver:", error);
        socket.emit("driver:error", {
          message:
            error instanceof Error ? error.message : "Registration failed",
        });
      }
    });

    // ✅ Handle disconnection - ONLY clear socketId
    // DO NOT change isOnline or isAvailable
    socket.on("disconnect", async () => {
      try {
        console.log(`🔌 [Socket] Disconnect event: ${socket.id}`);

        // Find driver by socket ID
        const driver = await driverStatusService.getDriverBySocketId(socket.id);

        if (driver) {
          const userId = driver.userId.toString();
          
          // ✅ Clear socket ID ONLY if it matches this socket
          // This prevents race condition where old socket clears new socket
          await driverStatusService.clearSocketId(userId, socket.id);

          // ✅ DO NOT change isOnline - preserve it!
          // ✅ DO NOT change isAvailable - preserve it!

          // Get status after clearing socket
          const status = await driverStatusService.getDriverStatus(userId);

          console.log(`🔌 [Socket] Driver disconnected: ${userId}`);
          console.log(`   isOnline: ${status.isOnline}, isAvailable: ${status.isAvailable}`);
          console.log(`   socketId: ${status.socketId || 'null'}`);

          // Notify others that driver disconnected
          io.emit("driver:disconnected", {
            userId: driver.userId,
            socketId: socket.id,
            timestamp: new Date().toISOString(),
          });
        } else {
          console.log(`🔌 [Socket] No driver found for socket: ${socket.id}`);
        }
      } catch (error) {
        console.error("Error handling disconnect:", error);
      }
    });
  });
};