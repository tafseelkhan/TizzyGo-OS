import jwt from "jsonwebtoken";
import mongoose from "mongoose";

export interface QRTokenData {
  bookingId: string;
  trackingId: string;
  rideId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  driverId: mongoose.Types.ObjectId;
  type: "pickup" | "drop";
  verificationFlag?: boolean;
  iat?: number;
  exp?: number;
  expiresAt?: string | Date;
}

export class QRTokenService {
  private readonly secret: string;
  private readonly expiresIn: number;

  constructor() {
    this.secret =
      process.env.QR_TOKEN_SECRET ||
      "6f20d8b4689bc25b2f619ff02fb1191eOEdOSJX4pnnxOENjQsiA_n7gLQlZaCHhO_AC45a11dd18fe859cd71f0a9c899d18a82";
    this.expiresIn = parseInt(process.env.QR_TOKEN_EXPIRY || "3600");
    console.log(
      "[QRTokenService] 🏗️ Constructor — expiresIn:",
      this.expiresIn,
      "sec",
    );
  }

  generateQRToken(data: QRTokenData): string {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + this.expiresIn;

    const payload = {
      ...data,
      iat: now,
      exp: expiresAt,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      verificationFlag: false,
    };

    console.log(
      "[QRTokenService] 🔐 generateQRToken — type:",
      data.type,
      "| iat:",
      now,
      "| exp:",
      expiresAt,
      "| expiresAt:",
      payload.expiresAt,
    );

    return jwt.sign(payload, this.secret);
  }

  verifyQRToken(token: string): QRTokenData | null {
    try {
      const decoded = jwt.verify(token, this.secret) as any;

      console.log(
        "[QRTokenService] 🔍 verifyQRToken — decoded iat:",
        decoded.iat,
        "| exp:",
        decoded.exp,
        "| expiresAt:",
        decoded.expiresAt,
      );

      return {
        bookingId: decoded.bookingId,
        trackingId: decoded.trackingId,
        rideId: decoded.rideId,
        customerId: decoded.customerId,
        driverId: decoded.driverId,
        type: decoded.type,
        verificationFlag: decoded.verificationFlag,
        iat: decoded.iat,
        exp: decoded.exp,
        expiresAt: decoded.expiresAt,
      };
    } catch (error) {
      console.error("[QRTokenService] ❌ verifyQRToken failed:", error);
      return null;
    }
  }

  markAsVerified(token: string): string | null {
    try {
      const decoded = jwt.verify(token, this.secret) as any;

      if (decoded.verificationFlag) {
        console.warn(
          "[QRTokenService] ⚠️ markAsVerified — token already verified",
        );
        return null;
      }

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + this.expiresIn;

      const newPayload = {
        ...decoded,
        verificationFlag: true,
        iat: now,
        exp: expiresAt,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
      };

      console.log(
        "[QRTokenService] 🏷️ markAsVerified — new exp:",
        expiresAt,
        "| expiresAt:",
        newPayload.expiresAt,
      );

      return jwt.sign(newPayload, this.secret);
    } catch (error) {
      console.error("[QRTokenService] ❌ markAsVerified failed:", error);
      return null;
    }
  }

  isTokenValid(token: string): boolean {
    try {
      const decoded = jwt.verify(token, this.secret) as any;
      return !decoded.verificationFlag;
    } catch (error) {
      return false;
    }
  }

  getTokenData(token: string): any {
    try {
      return jwt.verify(token, this.secret);
    } catch (error) {
      return null;
    }
  }
}