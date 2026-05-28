import dotenv from "dotenv";
dotenv.config();

import http from "http";
import mongoose from "mongoose";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
// import { socketHandler } from "./sockets/socket";

const PORT = Number(process.env.PORT) || 5000;

const server = http.createServer(app);

// ✅ Setup Socket.IO
// const allowedOrigins = ["http://172.20.10.12:3002", "http://172.20.10.12:3000","https://tizzyos.com", "https://tizzygo.com"];
// const io = new SocketIOServer(server, {
//   cors: {
//     origin: allowedOrigins,
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//   },
// });
// app.locals.io = io;
// socketHandler(io);

// ✅ Connect MongoDB
mongoose
  .connect(process.env.MONGO_URI!)
  .then(() => {
    console.log("✅ MongoDB connected successfully!");
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running at: http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });
