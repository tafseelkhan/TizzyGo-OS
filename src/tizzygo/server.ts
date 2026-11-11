import dotenv from "dotenv";
dotenv.config();

import http from "http";
import mongoose from "mongoose";
import app from "./app";
import { setupSocketIO } from "../socket";
import { PaymentGatewayFactory } from "../factories/PaymentGatewayFactory";
import { connectQutonConnectDB } from "../config/tizzygo/qutonConnectDatabase";

const PORT = Number(process.env.TIZZYGO_PORT) || 1000;
const NODE_ENV = process.env.NODE_ENV ?? "development";

const server = http.createServer(app);

function log(level: "info" | "warn" | "error", message: string, meta?: unknown) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (meta !== undefined) {
    console[level](`${prefix} ${message}`, meta);
  } else {
    console[level](`${prefix} ${message}`);
  }
}

// Payment gateway initialization
PaymentGatewayFactory.initialize();
log("info", "💳 Payment gateway initialized");

// Socket.IO
const io = setupSocketIO(server);
app.locals.io = io;
log("info", "🔌 Socket.IO attached to HTTP server");

(global as any).__DEV__ = NODE_ENV !== "production";

async function startServer() {
  log("info", `🌱 Starting TizzyGo server (env=${NODE_ENV}, port=${PORT})`);

  try {
    // 1. Connect to existing TizzyGo database.
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing");
    }

    log("info", "🔗 Connecting to TizzyGo MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    log("info", "✅ TizzyGo MongoDB connected");

    // 2. Connect separately to Quton Connect database.
    log("info", "🔗 Connecting to Quton Connect database...");
    await connectQutonConnectDB();
    log("info", "✅ Quton Connect database connected");

    // 3. Start server only after both connections succeed.
    server.listen(PORT, "0.0.0.0", () => {
      log("info", `🚀 TizzyGo server running at: http://0.0.0.0:${PORT}`);
      log("info", `🔌 Socket.IO running at: http://0.0.0.0:${PORT}`);
      log("info", `🌍 Environment: ${NODE_ENV}`);
    });
  } catch (error) {
    log("error", "❌ Server startup/database error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  }
}

// Handle port-in-use / listen errors explicitly
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    log("error", `❌ Port ${PORT} is already in use`);
  } else {
    log("error", "❌ HTTP server error", {
      code: error.code,
      message: error.message,
    });
  }
  process.exit(1);
});

// Graceful shutdown
async function shutdown(signal: string) {
  log("warn", `🛑 Received ${signal}, shutting down gracefully...`);

  server.close(async () => {
    log("info", "🔒 HTTP server closed");
    await mongoose.disconnect().catch(() => undefined);
    log("info", "🔒 MongoDB disconnected");
    process.exit(0);
  });

  // Force exit if shutdown takes too long
  setTimeout(() => {
    log("error", "❌ Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  log("error", "❌ Unhandled promise rejection", reason);
});

process.on("uncaughtException", (error) => {
  log("error", "❌ Uncaught exception", {
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

startServer();