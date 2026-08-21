// src/socket/handlers/orderTrackingSocketHandler.ts

import { Server, Socket } from "socket.io";
import { OrderTrackingService } from "../../services/tizzygo/orderTrackingService";
import DeliveryTracking from "../../models/tizzyos/shipping/order/deliveryTracking";
import ShippingLocation from "../../models/tizzyos/shipping/fws/fwsRiderLocation";

const trackingService = new OrderTrackingService();

// Track active tracking rooms to avoid duplicate emits
const activeTrackingRooms = new Map<string, Set<string>>();

export const orderTrackingSocketHandler = (io: Server) => {
  const trackingNamespace = io.of("/tracking");

  trackingNamespace.on("connection", (socket: Socket) => {
    console.log(`Tracking socket connected: ${socket.id}`);

    // Join tracking room
    socket.on("tracking:join", async ({ orderId }: { orderId: string }) => {
      try {
        if (!orderId) {
          socket.emit("tracking:error", {
            message: "Order ID is required",
          });
          return;
        }

        // Get user ID from socket auth
        const userId = socket.data.userId;
        if (!userId) {
          socket.emit("tracking:error", {
            message: "Authentication required",
          });
          return;
        }

        // Store orderId in socket data for reconnection
        socket.data.orderId = orderId;

        // Leave any previous room
        if (socket.data.currentRoom) {
          socket.leave(socket.data.currentRoom);
          const roomMembers = activeTrackingRooms.get(socket.data.currentRoom);
          if (roomMembers) {
            roomMembers.delete(socket.id);
            if (roomMembers.size === 0) {
              activeTrackingRooms.delete(socket.data.currentRoom);
            }
          }
        }

        // Join room
        const roomName = `tracking_${orderId}`;
        socket.join(roomName);
        socket.data.currentRoom = roomName;

        // Track room membership
        if (!activeTrackingRooms.has(roomName)) {
          activeTrackingRooms.set(roomName, new Set());
        }
        activeTrackingRooms.get(roomName)!.add(socket.id);

        // Get initial tracking data
        const trackingData = await trackingService.getInitialTrackingData(
          orderId,
          userId,
        );

        if (!trackingData) {
          socket.emit("tracking:error", {
            message: "Tracking data not found",
          });
          return;
        }

        // Send initial data
        socket.emit("tracking:connected", {
          success: true,
          data: trackingData,
        });

        // Send tracking update immediately
        const updateData = await trackingService.getTrackingUpdate(orderId);
        if (updateData) {
          socket.emit("tracking:update", updateData);
        }

        console.log(`User ${userId} joined tracking room: ${roomName}`);

        // Start listening for tracking changes
        const changeStream = DeliveryTracking.watch([
          { $match: { "fullDocument.orderId": orderId } },
        ]);

        changeStream.on("change", async (change) => {
          if (
            change.operationType === "update" ||
            change.operationType === "replace"
          ) {
            const updatedTracking = await DeliveryTracking.findOne({
              orderId,
            }).lean();
            if (updatedTracking) {
              // Check if status changed
              const oldStatus =
                change.updateDescription?.updatedFields?.currentStatus;
              const newStatus = updatedTracking.currentStatus;

              // Get updated tracking data
              const updateData =
                await trackingService.getTrackingUpdate(orderId);
              if (updateData) {
                // Emit to room
                io.to(roomName).emit("tracking:update", updateData);

                // If status changed, emit status change event
                if (oldStatus && oldStatus !== newStatus) {
                  io.to(roomName).emit("tracking:statusChanged", {
                    orderId,
                    oldStatus,
                    newStatus,
                    timestamp: new Date(),
                  });
                }

                // If delivered, emit completed event
                if (newStatus === "delivered") {
                  io.to(roomName).emit("tracking:completed", {
                    orderId,
                    deliveredAt: new Date(),
                  });
                }
              }
            }
          }
        });

        // Store change stream reference for cleanup
        socket.data.changeStream = changeStream;

        // Listen for rider location changes
        const updatedTracking = await DeliveryTracking.findOne({
          orderId,
        }).lean();
        const locationChangeStream = ShippingLocation.watch([
          {
            $match: {
              "fullDocument.shippingId": updatedTracking?.currentHolderId,
            },
          },
        ]);

        locationChangeStream.on("change", async (change) => {
          if (
            change.operationType === "update" ||
            change.operationType === "replace"
          ) {
            const updatedRider = await ShippingLocation.findOne({
              shippingId: updatedTracking?.currentHolderId,
            }).lean();

            if (updatedRider?.location) {
              const updateData =
                await trackingService.getTrackingUpdate(orderId);
              if (updateData) {
                io.to(roomName).emit("tracking:update", updateData);
              }
            }
          }
        });

        socket.data.locationChangeStream = locationChangeStream;
      } catch (error) {
        console.log("Error in tracking:join:", error);
        socket.emit("tracking:error", {
          message:
            error instanceof Error ? error.message : "Failed to join tracking",
        });
      }
    });

    // Leave tracking room
    socket.on("tracking:leave", () => {
      if (socket.data.currentRoom) {
        socket.leave(socket.data.currentRoom);
        const roomMembers = activeTrackingRooms.get(socket.data.currentRoom);
        if (roomMembers) {
          roomMembers.delete(socket.id);
          if (roomMembers.size === 0) {
            activeTrackingRooms.delete(socket.data.currentRoom);
          }
        }
        socket.data.currentRoom = null;
        socket.data.orderId = null;

        // Cleanup change streams
        if (socket.data.changeStream) {
          socket.data.changeStream.close();
        }
        if (socket.data.locationChangeStream) {
          socket.data.locationChangeStream.close();
        }

        console.log(`Socket ${socket.id} left tracking room`);
      }
    });

    // Reconnect handler
    socket.on(
      "tracking:reconnect",
      async ({ orderId }: { orderId: string }) => {
        if (orderId) {
          await socket.emit("tracking:join", { orderId });
          console.log(
            `Socket ${socket.id} reconnected to tracking: ${orderId}`,
          );
        }
      },
    );

    // Handle disconnect
    socket.on("disconnect", () => {
      if (socket.data.currentRoom) {
        const roomMembers = activeTrackingRooms.get(socket.data.currentRoom);
        if (roomMembers) {
          roomMembers.delete(socket.id);
          if (roomMembers.size === 0) {
            activeTrackingRooms.delete(socket.data.currentRoom);
          }
        }
        console.log(
          `Socket ${socket.id} disconnected from ${socket.data.currentRoom}`,
        );
      }

      // Cleanup change streams
      if (socket.data.changeStream) {
        socket.data.changeStream.close();
      }
      if (socket.data.locationChangeStream) {
        socket.data.locationChangeStream.close();
      }
    });
  });
};

export default orderTrackingSocketHandler;
