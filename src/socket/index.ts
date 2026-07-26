// socket/index.ts

import { Server } from "socket.io";
import { Server as HTTPServer } from "http";
import { rideDriverOnlineOffline } from "../handlers/tizzyos/cab/rideDriverOnlineOffline";
import { socketHandlers } from "../handlers/tizzyos/cab/rideHandler";
import { rideLiveTrackingHandler } from "../handlers/tizzyos/cab/rideLiveTrackingHandler";

export const setupSocketIO = (httpServer: HTTPServer): Server => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["websocket", "polling"],
  });

  // Initialize socket handlers
  socketHandlers(io);
  rideDriverOnlineOffline(io);
  // ✅ NEW handler - Live tracking
  rideLiveTrackingHandler(io);

  return io;
};;
