// server.ts

import dotenv from "dotenv";
dotenv.config();

import http from "http";
import mongoose from "mongoose";
import app from "./app";
import { setupSocketIO } from "./socket";
import { showBanner } from "./utils/serverBanner";

const PORT = Number(process.env.PORT) || 5000;

// ✅ Show banner first
showBanner();

const server = http.createServer(app);

// ✅ Setup Socket.IO
const io = setupSocketIO(server);
app.locals.io = io;

// ✅ Connect MongoDB with stylish logs
const mongoUri = process.env.MONGO_URI || "N/A";
const maskedUri = mongoUri.replace(/\/\/.*@/, "//****:****@");
const dbName = mongoUri.split("/").pop()?.split("?")[0] || "TizzyGo-OS";

console.log("  --------------------------------------------");
console.log("  📦  Connecting to MongoDB...               ");
console.log("  🔗  " + maskedUri.padEnd(43) + "");
console.log("  --------------------------------------------");
console.log("");

mongoose
  .connect(process.env.MONGO_URI!)
  .then(() => {
    console.log("");
    console.log("  --------------------------------------------");
    console.log("  ✅  MONGODB CONNECTED SUCCESSFULLY! ");
    console.log("  📍  Database: " + dbName.padEnd(39) + "");
    console.log("  --------------------------------------------");
    console.log("");

    server.listen(PORT, "0.0.0.0", () => {
      const portStr = PORT.toString();
      const serverUrl = "http://0.0.0.0:" + portStr;

      console.log("  --------------------------------------------");
      console.log(
        "    🌐  SERVER STATUS                                         ",
      );
      console.log(
        "                                                               ",
      );
      console.log("  │  🚀  Server    :  " + serverUrl.padEnd(43) + "");
      console.log("  │  🔌  Socket.IO :  " + serverUrl.padEnd(43) + "");
      console.log();
      console.log(
        "                                                                ",
      );
      // ✅ HEALTH CHECK RESPONSE (JSON format)
      console.log("  --------------------------------------------");
      console.log(
        "    📊  HEALTH CHECK RESPONSE                                ",
      );
      console.log(
        "                                                            ",
      );
      console.log(
        "   {                                                         ",
      );
      console.log(
        "      success: true,                                          ",
      );
      console.log(
        '      status: "OK",                                          ',
      );
      console.log(
        "      uptime: " +
          process.uptime().toFixed(2) +
          "s,                                       ",
      );
      console.log('      timestamp: "' + new Date().toISOString() + '"   ');
      console.log(
        "    }                                                         ",
      );
      console.log("  --------------------------------------------");
      console.log("");
      console.log("  --------------------------------------------");
      console.log(
        "  🎯  TIZZYGO-OS is now RUNNING                                ",
      );
      console.log("  --------------------------------------------");
      console.log("");
    });
  })
  .catch((err) => {
    console.log("");
    console.log("--------------------------------------------");
    console.log("❌  MONGODB CONNECTION FAILED");
    console.log("--------------------------------------------");
    console.log(
      "🔴  Error: " + (err.message || "Unknown error").padEnd(38) + "",
    );
    // 🔴 HEALTH CHECK RESPONSE (JSON format) - ERROR
    console.log("  --------------------------------------------");
    console.log(
      "    📊  HEALTH CHECK RESPONSE                                ",
    );
    console.log("                                                            ");
    console.log(
      "   {                                                         ",
    );
    console.log(
      "      success: false,                                          ",
    );
    console.log(
      '      status: "ERROR",                                        ',
    );
    
    console.log(
      '      error: "' +
        (err.message || "Unknown error").padEnd(36) +
        '",',
    );
    console.log('      timestamp: "' + new Date().toISOString() + '"   ');
    console.log(
      "    }                                                         ",
    );
    console.log("  --------------------------------------------");
    console.log("")
    console.log("--------------------------------------------");
    console.log("💡  Please check your MongoDB URI and network");
    console.log("--------------------------------------------");
    console.log("    📝  MONGO_URI: " + maskedUri.padEnd(35) + "");
    console.log("--------------------------------------------");
    console.log("");
    process.exit(1);
  });

(global as any).__DEV__ = process.env.NODE_ENV !== "production";
