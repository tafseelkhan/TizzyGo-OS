
import dotenv from "dotenv";
dotenv.config();

import http from "http";
import mongoose from "mongoose";
import app from "./app";
import { setupSocketIO } from "../socket";
import { PaymentGatewayFactory } from "../factories/PaymentGatewayFactory";
import { connectQutonConnectDB } from "../config/tizzygo/qutonConnectDatabase";

const PORT = Number(process.env.TIZZYGO_PORT) || 1000;

const server = http.createServer(app);

// Payment gateway initialization
PaymentGatewayFactory.initialize();

// Socket.IO
const io = setupSocketIO(server);
app.locals.io = io;

(global as any).__DEV__ = process.env.NODE_ENV !== "production";

async function startServer() {
  try {
    // 1. Connect to existing TizzyGo database.
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ TizzyGo MongoDB connected");

    // 2. Connect separately to Quton Connect database.
    await connectQutonConnectDB();

    // 3. Start server only after both connections succeed.
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 TizzyGo server running on port ${PORT}`);
      console.log(`🔌 Socket.IO running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Server startup/database error:", error);

    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  }
}

startServer();
