import mongoose from "mongoose";
import { QRTokenService, QRTokenData } from "../../../utils/tizzyos/cab/qrToken";
import RideBooking from "../../../models/tizzyos/cab/rideBooking";
import RideTracking, {
  IRideTracking,
} from "../../../models/tizzyos/cab/rideTracking";
import { generateQRCodeDataURI } from "../../../utils/tizzyos/cab/qrGenerator";

// ============================================================
// LOGGER HELPER
// ============================================================
const LOG_PREFIX = "[RideQRCodeService]";

const log = (label: string, ...args: any[]) => {
  console.log(`${LOG_PREFIX} ${label}`, ...args);
};

const logError = (label: string, ...args: any[]) => {
  console.error(`${LOG_PREFIX} ❌ ${label}`, ...args);
};

const logWarn = (label: string, ...args: any[]) => {
  console.warn(`${LOG_PREFIX} ⚠️ ${label}`, ...args);
};

const logSuccess = (label: string, ...args: any[]) => {
  console.log(`${LOG_PREFIX} ✅ ${label}`, ...args);
};

// ============================================================
// INTERFACES
// ============================================================
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

// ============================================================
// SERVICE CLASS
// ============================================================
export class RideQRCodeService {
  private readonly qrTokenService: QRTokenService;
  private readonly QR_VERIFICATION_TIMEOUT_MS: number = 30000;
  private readonly verificationCache: Map<
    string,
    { verified: boolean; timestamp: number }
  >;

  constructor() {
    log("🏗️ Constructor called — initializing service");
    try {
      this.qrTokenService = new QRTokenService();
      this.verificationCache = new Map();
      logSuccess("Constructor completed — QRTokenService initialized");
    } catch (err) {
      logError("Constructor failed", err);
      throw err;
    }
  }

  // ============================================================
  // GENERATE QR CODES
  // ============================================================
  async generateQRCodes(bookingId: string): Promise<IQRTokens> {
    log("📥 generateQRCodes called — bookingId:", bookingId);

    if (!bookingId || typeof bookingId !== "string") {
      logError("generateQRCodes — invalid bookingId:", bookingId);
      throw new Error("Invalid booking ID");
    }

    log("🔍 Finding booking in DB...");
    const booking = await RideBooking.findOne({ bookingId }).lean().exec();
    log("📦 Booking found:", booking ? `bookingId=${booking.bookingId}` : "null");

    if (!booking) {
      logError("generateQRCodes — booking not found:", bookingId);
      throw new Error(`Booking not found: ${bookingId}`);
    }

    if (!booking.trackingId) {
      logError("generateQRCodes — tracking not initialized for booking:", bookingId);
      throw new Error(`Tracking not initialized for booking: ${bookingId}`);
    }

    log("🔍 Finding tracking in DB — trackingId:", booking.trackingId);
    const tracking = await RideTracking.findOne({
      trackingId: booking.trackingId,
    })
      .lean()
      .exec();
    log("📦 Tracking found:", tracking ? `trackingId=${(tracking as any).trackingId}` : "null");

    if (!tracking) {
      logError("generateQRCodes — tracking not found:", booking.trackingId);
      throw new Error(`Tracking not found: ${booking.trackingId}`);
    }

    log("🔍 Validating ObjectIds...");
    const rideId = this.validateObjectId(booking._id);
    log("✅ rideId:", String(rideId));

    const customerId = this.validateObjectId(booking.customerId);
    log("✅ customerId:", String(customerId));

    let driverId: mongoose.Types.ObjectId;
    try {
      driverId = booking.driverId
        ? this.validateObjectId(booking.driverId)
        : new mongoose.Types.ObjectId();
      log("✅ driverId:", String(driverId), booking.driverId ? "(from booking)" : "(generated new)");
    } catch (error) {
      logWarn("driverId validation failed — generating new ObjectId", error);
      driverId = new mongoose.Types.ObjectId();
      log("✅ driverId (new):", String(driverId));
    }

    const baseData: Omit<QRTokenData, "type"> = {
      bookingId: booking.bookingId,
      trackingId: booking.trackingId,
      rideId: rideId,
      customerId: customerId,
      driverId: driverId,
    };
    log("📋 baseData prepared:", {
      bookingId: baseData.bookingId,
      trackingId: baseData.trackingId,
      rideId: String(baseData.rideId),
      customerId: String(baseData.customerId),
      driverId: String(baseData.driverId),
    });

    log("🔐 Generating pickup + drop QR tokens in parallel...");
    const [pickupQR, dropQR] = await Promise.all([
      this.generateQRToken({ ...baseData, type: "pickup" }),
      this.generateQRToken({ ...baseData, type: "drop" }),
    ]);
    logSuccess("Both QR tokens generated", {
      pickupTokenLength: pickupQR.token.length,
      dropTokenLength: dropQR.token.length,
      pickupQrCodeLength: pickupQR.qrCode.length,
      dropQrCodeLength: dropQR.qrCode.length,
    });

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

  // ============================================================
  // GENERATE QR TOKEN (private)
  // ============================================================
  private async generateQRToken(data: QRTokenData): Promise<{
    token: string;
    qrCode: string;
    type: "pickup" | "drop";
  }> {
    log(`🔐 generateQRToken called — type: ${data.type}`);
    try {
      log("  → Signing token via QRTokenService...");
      const token = this.qrTokenService.generateQRToken(data);
      log(`  → Token signed (length: ${token.length})`);

      log("  → Generating QR code data URI...");
      const qrCode = await generateQRCodeDataURI(token);
      log(`  → QR code generated (length: ${qrCode.length})`);

      logSuccess(`generateQRToken complete — type: ${data.type}`);
      return {
        token,
        qrCode,
        type: data.type,
      };
    } catch (error) {
      logError(`generateQRToken failed — type: ${data.type}`, error);
      throw new Error(
        `Failed to generate QR token: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ============================================================
  // VERIFY QR TOKEN (decode + cache + expiry check)
  // ============================================================
  async verifyQRToken(token: string): Promise<IQRNormalized> {
    log("🔍 verifyQRToken called — token length:", token?.length);

    if (!token || typeof token !== "string") {
      logError("verifyQRToken — invalid token type:", typeof token);
      throw new Error("Invalid QR token");
    }

    const cacheKey = this.getTokenCacheKey(token);
    log("  → cacheKey:", cacheKey);

    const cached = this.verificationCache.get(cacheKey);
    log("  → cache lookup:", cached ? `verified=${cached.verified}` : "not cached");

    if (cached && cached.verified) {
      logError("verifyQRToken — token already used (cache hit)");
      throw new Error("QR token already used");
    }

    log("  → Decoding token via QRTokenService...");
    const decoded = this.qrTokenService.verifyQRToken(token);
    log("  → Decoded payload:", decoded);

    if (!decoded) {
      logError("verifyQRToken — decode returned null/undefined");
      throw new Error("Invalid QR token");
    }

    const normalized = decoded as any;

    if (normalized.verificationFlag) {
      logError("verifyQRToken — token already verified (flag set)");
      throw new Error("QR token already used");
    }

    const now = new Date();

    // ✅ Robust expiresAt detection (triple fallback)
    let expiresAt: Date;
    if (normalized.expiresAt) {
      expiresAt = new Date(normalized.expiresAt);
      log("  → expiresAt from token:", expiresAt.toISOString());
    } else if (normalized.exp) {
      expiresAt = new Date(normalized.exp * 1000);
      log("  → expiresAt from JWT exp:", expiresAt.toISOString());
    } else {
      const iat = normalized.iat ? new Date(normalized.iat * 1000) : now;
      expiresAt = new Date(iat.getTime() + 15 * 60 * 1000);
      logWarn(
        "  → expiresAt MISSING — fallback (iat + 15min):",
        expiresAt.toISOString(),
      );
    }

    if (isNaN(expiresAt.getTime())) {
      logError("verifyQRToken — computed expiresAt is invalid:", expiresAt);
      throw new Error("Invalid token expiry");
    }

    log(
      "  → Time check — now:",
      now.toISOString(),
      "| expiresAt:",
      expiresAt.toISOString(),
    );

    if (expiresAt < now) {
      logError("verifyQRToken — token expired");
      throw new Error("QR token expired");
    }

    log("  → Validating ObjectIds from payload...");
    const rideId = this.validateObjectId(normalized.rideId);
    const customerId = this.validateObjectId(normalized.customerId);
    const driverId = this.validateObjectId(normalized.driverId);

    // ✅ Safe iat handling
    let iatDate: Date;
    if (normalized.iat) {
      iatDate =
        typeof normalized.iat === "number"
          ? new Date(normalized.iat * 1000)
          : new Date(normalized.iat);
      if (isNaN(iatDate.getTime())) iatDate = now;
    } else {
      iatDate = now;
    }

    logSuccess("verifyQRToken complete", {
      bookingId: normalized.bookingId,
      trackingId: normalized.trackingId,
      type: normalized.type,
      rideId: String(rideId),
      customerId: String(customerId),
      driverId: String(driverId),
    });

    return {
      bookingId: normalized.bookingId,
      trackingId: normalized.trackingId,
      rideId,
      customerId,
      driverId,
      type: normalized.type,
      verificationFlag: normalized.verificationFlag || false,
      expiresAt,
      iat: iatDate,
    };
  }

  // ============================================================
  // MARK QR AS VERIFIED (regenerate token with flag)
  // ============================================================
  async markQRAsVerified(token: string): Promise<string> {
    log("🏷️ markQRAsVerified called — token length:", token?.length);

    if (!token || typeof token !== "string") {
      logError("markQRAsVerified — invalid token type");
      throw new Error("Invalid QR token");
    }

    log("  → Calling QRTokenService.markAsVerified...");
    const newToken = this.qrTokenService.markAsVerified(token);

    if (!newToken) {
      logError("markQRAsVerified — markAsVerified returned null");
      throw new Error("Failed to mark QR as verified");
    }
    log("  → New token generated (length:", newToken.length, ")");

    const cacheKey = this.getTokenCacheKey(token);
    this.verificationCache.set(cacheKey, {
      verified: true,
      timestamp: Date.now(),
    });
    logSuccess("markQRAsVerified complete — cacheKey:", cacheKey);
    return newToken;
  }

  // ============================================================
  // VERIFY PICKUP
  // ============================================================
  async verifyPickup(token: string): Promise<IVerifyResult> {
    log("📥 verifyPickup called — token length:", token?.length);

    if (!token || typeof token !== "string") {
      logError("verifyPickup — invalid token type");
      throw new Error("Invalid QR token");
    }

    log("  → Starting mongoose session...");
    const session = await mongoose.startSession();
    session.startTransaction();
    log("  → Transaction started");

    try {
      log("  → Decoding & validating token...");
      const decoded = await this.verifyQRToken(token);
      log("  → Decoded:", {
        bookingId: decoded.bookingId,
        trackingId: decoded.trackingId,
        type: decoded.type,
      });

      if (decoded.type !== "pickup") {
        logError(
          `verifyPickup — wrong token type. Expected pickup, got ${decoded.type}`,
        );
        throw new Error(
          `Invalid QR type for pickup. Expected "pickup", got "${decoded.type}"`,
        );
      }

      log("  → Looking up tracking:", decoded.trackingId);
      const tracking = await RideTracking.findOne({
        trackingId: decoded.trackingId,
      }).session(session);

      if (!tracking) {
        logError("verifyPickup — tracking not found:", decoded.trackingId);
        throw new Error(`Tracking not found: ${decoded.trackingId}`);
      }
      log("  → Tracking found. Already verified?", tracking.pickupVerified);

      if (tracking.pickupVerified) {
        logError("verifyPickup — pickup already verified");
        throw new Error("Pickup already verified");
      }

      const now = new Date();
      const timeoutDate = new Date(
        now.getTime() - this.QR_VERIFICATION_TIMEOUT_MS,
      );
      log("  → Timeout check — now:", now.toISOString(), "| timeoutDate:", timeoutDate.toISOString());

      if (
        tracking.pickupVerifiedAt &&
        tracking.pickupVerifiedAt < timeoutDate
      ) {
        logError("verifyPickup — verification timeout expired");
        throw new Error("Pickup verification timeout expired");
      }

      log("  → Marking token as verified...");
      const newToken = await this.markQRAsVerified(token);

      log("  → Updating tracking document...");
      const trackingDoc = tracking as ITrackingWithQR;
      trackingDoc.pickupVerified = true;
      trackingDoc.pickupVerifiedAt = now;
      trackingDoc.rideStatus = "pickupVerified";
      trackingDoc.pickupQRToken = newToken;
      await trackingDoc.save({ session });
      log("  → Tracking saved");

      log("  → Looking up booking:", decoded.bookingId);
      const booking = await RideBooking.findOne({
        bookingId: decoded.bookingId,
      }).session(session);

      if (booking) {
        log("  → Booking found. Updating status...");
        booking.pickupVerified = true;
        booking.pickupVerifiedAt = now;
        booking.status = "pickupVerified";
        await booking.save({ session });
        log("  → Booking saved");
      } else {
        logError("verifyPickup — booking not found:", decoded.bookingId);
        throw new Error(`Booking not found: ${decoded.bookingId}`);
      }

      log("  → Committing transaction...");
      await session.commitTransaction();
      logSuccess("verifyPickup — transaction committed");

      return {
        bookingId: decoded.bookingId,
        trackingId: decoded.trackingId,
        type: "pickup",
        verified: true,
        verifiedAt: now,
      };
    } catch (error) {
      logError("verifyPickup — aborting transaction", error);
      await session.abortTransaction();
      throw error;
    } finally {
      log("  → Ending session");
      await session.endSession();
    }
  }

  // ============================================================
  // VERIFY DROP
  // ============================================================
  async verifyDrop(token: string): Promise<IVerifyResult> {
    log("📥 verifyDrop called — token length:", token?.length);

    if (!token || typeof token !== "string") {
      logError("verifyDrop — invalid token type");
      throw new Error("Invalid QR token");
    }

    log("  → Starting mongoose session...");
    const session = await mongoose.startSession();
    session.startTransaction();
    log("  → Transaction started");

    try {
      log("  → Decoding & validating token...");
      const decoded = await this.verifyQRToken(token);
      log("  → Decoded:", {
        bookingId: decoded.bookingId,
        trackingId: decoded.trackingId,
        type: decoded.type,
      });

      if (decoded.type !== "drop") {
        logError(
          `verifyDrop — wrong token type. Expected drop, got ${decoded.type}`,
        );
        throw new Error(
          `Invalid QR type for drop. Expected "drop", got "${decoded.type}"`,
        );
      }

      log("  → Looking up tracking:", decoded.trackingId);
      const tracking = await RideTracking.findOne({
        trackingId: decoded.trackingId,
      }).session(session);

      if (!tracking) {
        logError("verifyDrop — tracking not found:", decoded.trackingId);
        throw new Error(`Tracking not found: ${decoded.trackingId}`);
      }
      log("  → Tracking found. dropVerified?", tracking.dropVerified, "| pickupVerified?", tracking.pickupVerified);

      if (tracking.dropVerified) {
        logError("verifyDrop — drop already verified");
        throw new Error("Drop already verified");
      }

      if (!tracking.pickupVerified) {
        logError("verifyDrop — pickup not verified yet, cannot verify drop");
        throw new Error("Pickup must be verified before drop verification");
      }

      const now = new Date();
      const timeoutDate = new Date(
        now.getTime() - this.QR_VERIFICATION_TIMEOUT_MS,
      );
      log("  → Timeout check — now:", now.toISOString());

      if (tracking.dropVerifiedAt && tracking.dropVerifiedAt < timeoutDate) {
        logError("verifyDrop — verification timeout expired");
        throw new Error("Drop verification timeout expired");
      }

      log("  → Marking token as verified...");
      const newToken = await this.markQRAsVerified(token);

      log("  → Updating tracking document...");
      const trackingDoc = tracking as ITrackingWithQR;
      trackingDoc.dropVerified = true;
      trackingDoc.dropVerifiedAt = now;
      trackingDoc.rideStatus = "dropVerified";
      trackingDoc.dropQRToken = newToken;
      await trackingDoc.save({ session });
      log("  → Tracking saved");

      log("  → Looking up booking:", decoded.bookingId);
      const booking = await RideBooking.findOne({
        bookingId: decoded.bookingId,
      }).session(session);

      if (booking) {
        log("  → Booking found. Updating status...");
        booking.dropVerified = true;
        booking.dropVerifiedAt = now;
        booking.status = "dropVerified";
        await booking.save({ session });
        log("  → Booking saved");
      } else {
        logError("verifyDrop — booking not found:", decoded.bookingId);
        throw new Error(`Booking not found: ${decoded.bookingId}`);
      }

      log("  → Committing transaction...");
      await session.commitTransaction();
      logSuccess("verifyDrop — transaction committed");

      return {
        bookingId: decoded.bookingId,
        trackingId: decoded.trackingId,
        type: "drop",
        verified: true,
        verifiedAt: now,
      };
    } catch (error) {
      logError("verifyDrop — aborting transaction", error);
      await session.abortTransaction();
      throw error;
    } finally {
      log("  → Ending session");
      await session.endSession();
    }
  }

  // ============================================================
  // GET QR CODE STATUS
  // ============================================================
  async getQRCodeStatus(bookingId: string): Promise<{
    bookingId: string;
    trackingId: string;
    pickupVerified: boolean;
    dropVerified: boolean;
    pickupQRToken: string | null;
    dropQRToken: string | null;
  }> {
    log("📥 getQRCodeStatus called — bookingId:", bookingId);

    if (!bookingId || typeof bookingId !== "string") {
      logError("getQRCodeStatus — invalid bookingId");
      throw new Error("Invalid booking ID");
    }

    const booking = await RideBooking.findOne({ bookingId }).lean().exec();
    log("📦 Booking found:", booking ? "yes" : "no");

    if (!booking) {
      logError("getQRCodeStatus — booking not found:", bookingId);
      throw new Error(`Booking not found: ${bookingId}`);
    }

    if (!booking.trackingId) {
      logError("getQRCodeStatus — tracking not initialized");
      throw new Error(`Tracking not initialized for booking: ${bookingId}`);
    }

    const tracking = await RideTracking.findOne({
      trackingId: booking.trackingId,
    })
      .lean()
      .exec();
    log("📦 Tracking found:", tracking ? "yes" : "no");

    if (!tracking) {
      logError("getQRCodeStatus — tracking not found:", booking.trackingId);
      throw new Error(`Tracking not found: ${booking.trackingId}`);
    }

    const trackingDoc = tracking as ITrackingWithQR;

    logSuccess("getQRCodeStatus complete", {
      pickupVerified: trackingDoc.pickupVerified,
      dropVerified: trackingDoc.dropVerified,
    });

    return {
      bookingId: booking.bookingId,
      trackingId: trackingDoc.trackingId,
      pickupVerified: trackingDoc.pickupVerified || false,
      dropVerified: trackingDoc.dropVerified || false,
      pickupQRToken: trackingDoc.pickupQRToken || null,
      dropQRToken: trackingDoc.dropQRToken || null,
    };
  }

  // ============================================================
  // REGENERATE QR CODES
  // ============================================================
  async regenerateQRCodes(bookingId: string): Promise<IQRTokens> {
    log("📥 regenerateQRCodes called — bookingId:", bookingId);

    if (!bookingId || typeof bookingId !== "string") {
      logError("regenerateQRCodes — invalid bookingId");
      throw new Error("Invalid booking ID");
    }

    log("  → Starting mongoose session...");
    const session = await mongoose.startSession();
    session.startTransaction();
    log("  → Transaction started");

    try {
      log("  → Looking up booking:", bookingId);
      const booking = await RideBooking.findOne({ bookingId }).session(session);

      if (!booking) {
        logError("regenerateQRCodes — booking not found:", bookingId);
        throw new Error(`Booking not found: ${bookingId}`);
      }

      if (!booking.trackingId) {
        logError("regenerateQRCodes — tracking not initialized");
        throw new Error(`Tracking not initialized for booking: ${bookingId}`);
      }

      log("  → Looking up tracking:", booking.trackingId);
      const tracking = await RideTracking.findOne({
        trackingId: booking.trackingId,
      }).session(session);

      if (!tracking) {
        logError("regenerateQRCodes — tracking not found:", booking.trackingId);
        throw new Error(`Tracking not found: ${booking.trackingId}`);
      }

      const trackingDoc = tracking as ITrackingWithQR;

      log("  → Verification status:", {
        pickupVerified: trackingDoc.pickupVerified,
        dropVerified: trackingDoc.dropVerified,
      });

      if (trackingDoc.pickupVerified || trackingDoc.dropVerified) {
        logError("regenerateQRCodes — verification already started");
        throw new Error(
          "Cannot regenerate QR codes after verification has started",
        );
      }

      log("  → Validating ObjectIds...");
      const rideId = this.validateObjectId(booking._id);
      const customerId = this.validateObjectId(booking.customerId);
      const driverId = booking.driverId
        ? this.validateObjectId(booking.driverId)
        : new mongoose.Types.ObjectId();
      log("  → ObjectIds validated");

      const baseData: Omit<QRTokenData, "type"> = {
        bookingId: booking.bookingId,
        trackingId: booking.trackingId,
        rideId: rideId,
        customerId: customerId,
        driverId: driverId,
      };

      log("  → Generating fresh QR tokens...");
      const [pickupQR, dropQR] = await Promise.all([
        this.generateQRToken({ ...baseData, type: "pickup" }),
        this.generateQRToken({ ...baseData, type: "drop" }),
      ]);

      log("  → Updating tracking with new tokens...");
      trackingDoc.pickupQRToken = pickupQR.token;
      trackingDoc.dropQRToken = dropQR.token;
      await trackingDoc.save({ session });
      log("  → Tracking saved");

      log("  → Committing transaction...");
      await session.commitTransaction();
      logSuccess("regenerateQRCodes complete");

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
      logError("regenerateQRCodes — aborting transaction", error);
      await session.abortTransaction();
      throw error;
    } finally {
      log("  → Ending session");
      await session.endSession();
    }
  }

  // ============================================================
  // VERIFY WITH RETRY
  // ============================================================
  async verifyQRWithRetry(
    token: string,
    maxRetries: number = 3,
  ): Promise<IVerifyResult> {
    log("📥 verifyQRWithRetry called — maxRetries:", maxRetries);
    let lastError: Error = new Error("QR verification failed");

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      log(`  → Attempt ${attempt}/${maxRetries}`);
      try {
        const decoded = await this.verifyQRToken(token);
        log("  → Decoded type:", decoded.type);

        if (decoded.type === "pickup") {
          log("  → Calling verifyPickup...");
          return await this.verifyPickup(token);
        } else if (decoded.type === "drop") {
          log("  → Calling verifyDrop...");
          return await this.verifyDrop(token);
        } else {
          logError("verifyQRWithRetry — unknown QR type:", decoded.type);
          throw new Error(`Unknown QR type: ${decoded.type}`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logError(`verifyQRWithRetry — attempt ${attempt} failed:`, lastError.message);

        if (attempt < maxRetries) {
          const delayMs = 1000 * attempt;
          log(`  → Retrying in ${delayMs}ms...`);
          await this.delay(delayMs);
          continue;
        }
        break;
      }
    }

    logError("verifyQRWithRetry — all attempts failed");
    throw lastError;
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================
  private async delay(ms: number): Promise<void> {
    log(`⏱️ delay(${ms}ms)`);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getTokenCacheKey(token: string): string {
    const key = token.substring(0, 20);
    log("🔑 getTokenCacheKey:", key);
    return key;
  }

  clearVerificationCache(): void {
    log("🧹 clearVerificationCache called — size before:", this.verificationCache.size);
    this.verificationCache.clear();
    logSuccess("Verification cache cleared");
  }

  private validateObjectId(
    id: string | mongoose.Types.ObjectId | null | undefined,
  ): mongoose.Types.ObjectId {
    log("🔍 validateObjectId — input:", String(id));

    if (!id) {
      logError("validateObjectId — id is null/undefined");
      throw new Error("ObjectId is required");
    }

    if (id instanceof mongoose.Types.ObjectId) {
      log("  → Already ObjectId instance:", String(id));
      return id;
    }

    if (typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
      const objId = new mongoose.Types.ObjectId(id);
      log("  → Converted string to ObjectId:", String(objId));
      return objId;
    }

    logError("validateObjectId — invalid ObjectId format:", String(id));
    throw new Error(`Invalid ObjectId: ${String(id)}`);
  }
}