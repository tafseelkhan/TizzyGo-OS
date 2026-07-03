import jwt from "jsonwebtoken";
import { Types } from "mongoose";

export interface QRTokenPayload {
  bookingId: string;
  trackingId: string;
  rideId: string;
  customerId: string;
  driverId: string;
  type: "pickup" | "drop";
  verificationFlag: boolean;
  expiresAt: Date;
}

export interface QRTokenData {
  bookingId: string;
  trackingId: string;
  rideId: Types.ObjectId;
  customerId: Types.ObjectId;
  driverId: Types.ObjectId;
  type: "pickup" | "drop";
}

export class QRTokenService {
  private readonly secret: string;
  private readonly expiresIn: string | number;

  constructor() {
    this.secret =
      process.env.JWT_SECRET ||
      "23ebd585-0ff0-4750-8fd7-76bd88b57dbf8bf28ac1-a29a-43ad-b481-2c20ae04b455";
    this.expiresIn = process.env.QR_TOKEN_EXPIRY || "10m";
  }

  generateQRToken(data: QRTokenData): string {
    const payload: QRTokenPayload = {
      bookingId: data.bookingId,
      trackingId: data.trackingId,
      rideId: data.rideId.toString(),
      customerId: data.customerId.toString(),
      driverId: data.driverId.toString(),
      type: data.type,
      verificationFlag: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };

    return jwt.sign(payload, this.secret, {
      expiresIn: this.expiresIn,
    } as jwt.SignOptions);
  }

  verifyQRToken(token: string): QRTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret) as QRTokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  markAsVerified(token: string): string | null {
    const decoded = this.verifyQRToken(token);
    if (!decoded || decoded.verificationFlag) return null;

    const payload: QRTokenPayload = {
      ...decoded,
      verificationFlag: true,
    };

    return jwt.sign(payload, this.secret, {
      expiresIn: this.expiresIn,
    } as jwt.SignOptions);
  }
}
