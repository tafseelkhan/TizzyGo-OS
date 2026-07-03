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
}

export class QRTokenService {
  private readonly secret: string;
  private readonly expiresIn: number;

  constructor() {
    this.secret =
      process.env.QR_TOKEN_SECRET ||
      "6f20d8b4689bc25b2f619ff02fb1191eOEdOSJX4pnnxOENjQsiA_n7gLQlZaCHhO_AC45a11dd18fe859cd71f0a9c899d18a82";
    this.expiresIn = parseInt(process.env.QR_TOKEN_EXPIRY || "3600");
  }

  generateQRToken(data: QRTokenData): string {
    const payload = {
      ...data,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.expiresIn,
      verificationFlag: false,
    };

    return jwt.sign(payload, this.secret);
  }

  verifyQRToken(token: string): QRTokenData | null {
    try {
      const decoded = jwt.verify(token, this.secret) as any;

      return {
        bookingId: decoded.bookingId,
        trackingId: decoded.trackingId,
        rideId: decoded.rideId,
        customerId: decoded.customerId,
        driverId: decoded.driverId,
        type: decoded.type,
        verificationFlag: decoded.verificationFlag,
      };
    } catch (error) {
      return null;
    }
  }

  markAsVerified(token: string): string | null {
    try {
      const decoded = jwt.verify(token, this.secret) as any;

      if (decoded.verificationFlag) {
        return null;
      }

      const newPayload = {
        ...decoded,
        verificationFlag: true,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + this.expiresIn,
      };

      return jwt.sign(newPayload, this.secret);
    } catch (error) {
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
