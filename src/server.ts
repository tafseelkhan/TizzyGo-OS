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
    console.log("\n");
    console.log("-----------------------------------------");
    console.log("          MONGODB CONNECTED✅            ");
    console.log("-----------------------------------------");
    console.log("\n");

    server.listen(PORT, "0.0.0.0", () => {
      console.log("-----------------------------------------");
      console.log("            SERVER STATUS 🚀            ");
      console.log("-----------------------------------------");
      console.log(`🚀  Server    :  http://0.0.0.0:${PORT}  `);
      console.log(`🔌  Socket.IO :  http://0.0.0.0:${PORT}  `);
      console.log("-----------------------------------------");
      console.log("\n");
    });
  })
  .catch((err) => {
    console.log("\n");
    console.log("-----------------------------------------");
    console.log("          MONGODB CONNECTION FAILED ❌   ");
    console.log("-----------------------------------------");
    console.log(`     Error: ${(err.message || "Unknown error").padEnd(25)} │`);
    console.log("-----------------------------------------");
    console.log("\n");
    process.exit(1);
  });

(global as any).__DEV__ = process.env.NODE_ENV !== "production";
