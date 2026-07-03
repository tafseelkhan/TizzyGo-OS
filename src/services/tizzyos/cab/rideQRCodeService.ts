import mongoose from "mongoose";
import { QRTokenService, QRTokenData } from "../../../utils/tizzyos/cab/qrToken";
import RideBooking from "../../../models/tizzyos/cab/rideBooking";
import RideTracking, {
  IRideTracking,
} from "../../../models/tizzyos/cab/rideTracking";
import { generateQRCodeDataURI } from "../../../utils/tizzyos/cab/qrGenerator";

interface IQRTokens {
  pickup: {
    token: string;
    qrCode: string;
    type: "pickup";
  };
  drop: {
    token: string;
    qrCode: string;
    type: "drop";
  };
}

interface IQRNormalized {
  bookingId: string;
  trackingId: string;
  rideId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  driverId: mongoose.Types.ObjectId;
  type: "pickup" | "drop";
  verificationFlag?: boolean;
  expiresAt: Date;
  iat: Date;
}

interface IVerifyResult {
  bookingId: string;
  trackingId: string;
  type: "pickup" | "drop";
  verified: boolean;
  verifiedAt: Date;
}

interface ITrackingWithQR extends IRideTracking {
  pickupQRToken?: string;
  dropQRToken?: string;
}

export class RideQRCodeService {
  private readonly qrTokenService: QRTokenService;
  private readonly QR_VERIFICATION_TIMEOUT_MS: number = 30000;
  private readonly verificationCache: Map<
    string,
    { verified: boolean; timestamp: number }
  >;

  constructor() {
    this.qrTokenService = new QRTokenService();
    this.verificationCache = new Map();
  }

  async generateQRCodes(bookingId: string): Promise<IQRTokens> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    const booking = await RideBooking.findOne({ bookingId }).lean().exec();

    if (!booking) {
      throw new Error(`Booking not found: ${bookingId}`);
    }

    if (!booking.trackingId) {
      throw new Error(`Tracking not initialized for booking: ${bookingId}`);
    }

    const tracking = await RideTracking.findOne({
      trackingId: booking.trackingId,
    })
      .lean()
      .exec();

    if (!tracking) {
      throw new Error(`Tracking not found: ${booking.trackingId}`);
    }

    const rideId = this.validateObjectId(booking._id);
    const customerId = this.validateObjectId(booking.customerId);

    let driverId: mongoose.Types.ObjectId;
    try {
      driverId = booking.driverId
        ? this.validateObjectId(booking.driverId)
        : new mongoose.Types.ObjectId();
    } catch (error) {
      driverId = new mongoose.Types.ObjectId();
    }

    const baseData: Omit<QRTokenData, "type"> = {
      bookingId: booking.bookingId,
      trackingId: booking.trackingId,
      rideId: rideId,
      customerId: customerId,
      driverId: driverId,
    };

    const [pickupQR, dropQR] = await Promise.all([
      this.generateQRToken({ ...baseData, type: "pickup" }),
      this.generateQRToken({ ...baseData, type: "drop" }),
    ]);

    return {
      pickup: {
        token: pickupQR.token,
        qrCode: pickupQR.qrCode,
        type: "pickup",
      },
      drop: {
        token: dropQR.token,
        qrCode: dropQR.qrCode,
        type: "drop",
      },
    };
  }

  private async generateQRToken(data: QRTokenData): Promise<{
    token: string;
    qrCode: string;
    type: "pickup" | "drop";
  }> {
    try {
      const token = this.qrTokenService.generateQRToken(data);
      const qrCode = await generateQRCodeDataURI(token);

      return {
        token,
        qrCode,
        type: data.type,
      };
    } catch (error) {
      throw new Error(
        `Failed to generate QR token: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async verifyQRToken(token: string): Promise<IQRNormalized> {
    if (!token || typeof token !== "string") {
      throw new Error("Invalid QR token");
    }

    const cacheKey = this.getTokenCacheKey(token);
    const cached = this.verificationCache.get(cacheKey);

    if (cached && cached.verified) {
      throw new Error("QR token already used");
    }

    const decoded = this.qrTokenService.verifyQRToken(token);

    if (!decoded) {
      throw new Error("Invalid QR token");
    }

    const normalized = decoded as any;

    if (normalized.verificationFlag) {
      throw new Error("QR token already used");
    }

    const now = new Date();
    const expiresAt = new Date(normalized.expiresAt);

    if (expiresAt < now) {
      throw new Error("QR token expired");
    }

    return {
      bookingId: normalized.bookingId,
      trackingId: normalized.trackingId,
      rideId: this.validateObjectId(normalized.rideId),
      customerId: this.validateObjectId(normalized.customerId),
      driverId: this.validateObjectId(normalized.driverId),
      type: normalized.type,
      verificationFlag: normalized.verificationFlag || false,
      expiresAt: expiresAt,
      iat: new Date(normalized.iat || now),
    };
  }

  async markQRAsVerified(token: string): Promise<string> {
    if (!token || typeof token !== "string") {
      throw new Error("Invalid QR token");
    }

    const newToken = this.qrTokenService.markAsVerified(token);

    if (!newToken) {
      throw new Error("Failed to mark QR as verified");
    }

    const cacheKey = this.getTokenCacheKey(token);
    this.verificationCache.set(cacheKey, {
      verified: true,
      timestamp: Date.now(),
    });

    return newToken;
  }

  async verifyPickup(token: string): Promise<IVerifyResult> {
    if (!token || typeof token !== "string") {
      throw new Error("Invalid QR token");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const decoded = await this.verifyQRToken(token);

      if (decoded.type !== "pickup") {
        throw new Error(
          `Invalid QR type for pickup. Expected "pickup", got "${decoded.type}"`,
        );
      }

      const tracking = await RideTracking.findOne({
        trackingId: decoded.trackingId,
      }).session(session);

      if (!tracking) {
        throw new Error(`Tracking not found: ${decoded.trackingId}`);
      }

      if (tracking.pickupVerified) {
        throw new Error("Pickup already verified");
      }

      const now = new Date();
      const timeoutDate = new Date(
        now.getTime() - this.QR_VERIFICATION_TIMEOUT_MS,
      );

      if (
        tracking.pickupVerifiedAt &&
        tracking.pickupVerifiedAt < timeoutDate
      ) {
        throw new Error("Pickup verification timeout expired");
      }

      const newToken = await this.markQRAsVerified(token);

      const trackingDoc = tracking as ITrackingWithQR;
      trackingDoc.pickupVerified = true;
      trackingDoc.pickupVerifiedAt = now;
      trackingDoc.rideStatus = "pickupVerified";
      trackingDoc.pickupQRToken = newToken;
      await trackingDoc.save({ session });

      const booking = await RideBooking.findOne({
        bookingId: decoded.bookingId,
      }).session(session);

      if (booking) {
        booking.pickupVerified = true;
        booking.pickupVerifiedAt = now;
        booking.status = "pickupVerified";
        await booking.save({ session });
      } else {
        throw new Error(`Booking not found: ${decoded.bookingId}`);
      }

      await session.commitTransaction();

      return {
        bookingId: decoded.bookingId,
        trackingId: decoded.trackingId,
        type: "pickup",
        verified: true,
        verifiedAt: now,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async verifyDrop(token: string): Promise<IVerifyResult> {
    if (!token || typeof token !== "string") {
      throw new Error("Invalid QR token");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const decoded = await this.verifyQRToken(token);

      if (decoded.type !== "drop") {
        throw new Error(
          `Invalid QR type for drop. Expected "drop", got "${decoded.type}"`,
        );
      }

      const tracking = await RideTracking.findOne({
        trackingId: decoded.trackingId,
      }).session(session);

      if (!tracking) {
        throw new Error(`Tracking not found: ${decoded.trackingId}`);
      }

      if (tracking.dropVerified) {
        throw new Error("Drop already verified");
      }

      if (!tracking.pickupVerified) {
        throw new Error("Pickup must be verified before drop verification");
      }

      const now = new Date();
      const timeoutDate = new Date(
        now.getTime() - this.QR_VERIFICATION_TIMEOUT_MS,
      );

      if (tracking.dropVerifiedAt && tracking.dropVerifiedAt < timeoutDate) {
        throw new Error("Drop verification timeout expired");
      }

      const newToken = await this.markQRAsVerified(token);

      const trackingDoc = tracking as ITrackingWithQR;
      trackingDoc.dropVerified = true;
      trackingDoc.dropVerifiedAt = now;
      trackingDoc.rideStatus = "dropVerified";
      trackingDoc.dropQRToken = newToken;
      await trackingDoc.save({ session });

      const booking = await RideBooking.findOne({
        bookingId: decoded.bookingId,
      }).session(session);

      if (booking) {
        booking.dropVerified = true;
        booking.dropVerifiedAt = now;
        booking.status = "dropVerified";
        await booking.save({ session });
      } else {
        throw new Error(`Booking not found: ${decoded.bookingId}`);
      }

      await session.commitTransaction();

      return {
        bookingId: decoded.bookingId,
        trackingId: decoded.trackingId,
        type: "drop",
        verified: true,
        verifiedAt: now,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async getQRCodeStatus(bookingId: string): Promise<{
    bookingId: string;
    trackingId: string;
    pickupVerified: boolean;
    dropVerified: boolean;
    pickupQRToken: string | null;
    dropQRToken: string | null;
  }> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    const booking = await RideBooking.findOne({ bookingId }).lean().exec();

    if (!booking) {
      throw new Error(`Booking not found: ${bookingId}`);
    }

    if (!booking.trackingId) {
      throw new Error(`Tracking not initialized for booking: ${bookingId}`);
    }

    const tracking = await RideTracking.findOne({
      trackingId: booking.trackingId,
    })
      .lean()
      .exec();

    if (!tracking) {
      throw new Error(`Tracking not found: ${booking.trackingId}`);
    }

    const trackingDoc = tracking as ITrackingWithQR;

    return {
      bookingId: booking.bookingId,
      trackingId: trackingDoc.trackingId,
      pickupVerified: trackingDoc.pickupVerified || false,
      dropVerified: trackingDoc.dropVerified || false,
      pickupQRToken: trackingDoc.pickupQRToken || null,
      dropQRToken: trackingDoc.dropQRToken || null,
    };
  }

  async regenerateQRCodes(bookingId: string): Promise<IQRTokens> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const booking = await RideBooking.findOne({ bookingId }).session(session);

      if (!booking) {
        throw new Error(`Booking not found: ${bookingId}`);
      }

      if (!booking.trackingId) {
        throw new Error(`Tracking not initialized for booking: ${bookingId}`);
      }

      const tracking = await RideTracking.findOne({
        trackingId: booking.trackingId,
      }).session(session);

      if (!tracking) {
        throw new Error(`Tracking not found: ${booking.trackingId}`);
      }

      const trackingDoc = tracking as ITrackingWithQR;

      if (trackingDoc.pickupVerified || trackingDoc.dropVerified) {
        throw new Error(
          "Cannot regenerate QR codes after verification has started",
        );
      }

      const rideId = this.validateObjectId(booking._id);
      const customerId = this.validateObjectId(booking.customerId);
      const driverId = booking.driverId
        ? this.validateObjectId(booking.driverId)
        : new mongoose.Types.ObjectId();

      const baseData: Omit<QRTokenData, "type"> = {
        bookingId: booking.bookingId,
        trackingId: booking.trackingId,
        rideId: rideId,
        customerId: customerId,
        driverId: driverId,
      };

      const [pickupQR, dropQR] = await Promise.all([
        this.generateQRToken({ ...baseData, type: "pickup" }),
        this.generateQRToken({ ...baseData, type: "drop" }),
      ]);

      trackingDoc.pickupQRToken = pickupQR.token;
      trackingDoc.dropQRToken = dropQR.token;
      await trackingDoc.save({ session });

      await session.commitTransaction();

      return {
        pickup: {
          token: pickupQR.token,
          qrCode: pickupQR.qrCode,
          type: "pickup",
        },
        drop: {
          token: dropQR.token,
          qrCode: dropQR.qrCode,
          type: "drop",
        },
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async verifyQRWithRetry(
    token: string,
    maxRetries: number = 3,
  ): Promise<IVerifyResult> {
    let lastError: Error = new Error("QR verification failed");

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const decoded = await this.verifyQRToken(token);

        if (decoded.type === "pickup") {
          return await this.verifyPickup(token);
        } else if (decoded.type === "drop") {
          return await this.verifyDrop(token);
        } else {
          throw new Error(`Unknown QR type: ${decoded.type}`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          await this.delay(1000 * attempt);
          continue;
        }
        break;
      }
    }

    throw lastError;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getTokenCacheKey(token: string): string {
    return token.substring(0, 20);
  }

  clearVerificationCache(): void {
    this.verificationCache.clear();
  }

  private validateObjectId(
    id: string | mongoose.Types.ObjectId | null | undefined,
  ): mongoose.Types.ObjectId {
    if (!id) {
      throw new Error("ObjectId is required");
    }

    if (id instanceof mongoose.Types.ObjectId) {
      return id;
    }

    if (typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }

    throw new Error(`Invalid ObjectId: ${String(id)}`);
  }
}
