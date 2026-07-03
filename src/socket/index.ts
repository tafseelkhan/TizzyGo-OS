// socket/index.ts

import { Server } from "socket.io";
import { Server as HTTPServer } from "http";
import { socketHandlers } from "../handlers/tizzyos/cab/rideHandler";

export const setupSocketIO = (httpServer: HTTPServer): Server => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["websocket", "polling"],
  });

  // Initialize socket handlers
  socketHandlers(io);

  return io;
};
