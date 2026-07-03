// server.ts

import dotenv from "dotenv";
dotenv.config();

import http from "http";
import mongoose from "mongoose";
import app from "./app";
import { setupSocketIO } from "./socket";

const PORT = Number(process.env.PORT) || 5000;

const server = http.createServer(app);

// ✅ Setup Socket.IO
const io = setupSocketIO(server);
app.locals.io = io;

// ✅ Connect MongoDB
mongoose
  .connect(process.env.MONGO_URI!)
  .then(() => {
    console.log("✅ MongoDB connected successfully!");
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running at: http://0.0.0.0:${PORT}`);
      console.log(`🔌 Socket.IO running on: http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });

(global as any).__DEV__ = process.env.NODE_ENV !== "production";
