// services/tizzyos/cab/rideFraudService.ts

import mongoose from "mongoose";
import RideDriverFraud from "../../../models/tizzyos/cab/rideDriverFraud";
import RideDriverFraudLog from "../../../models/tizzyos/cab/rideDriverFraudLog";

interface IFraudAction {
  userId: mongoose.Types.ObjectId | string;
  bookingId: string;
  rideId: mongoose.Types.ObjectId | string;
  action: "accepted" | "completed" | "cancelled" | "rejected" | "timeout";
  rideCode: string;
}

interface IFraudDocument {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  totalAcceptedRides: number;
  totalCompletedRides: number;
  totalCancelledRides: number;
  totalRejectedRequests: number;
  totalTimeoutRequests: number;
  cancellationRate: number;
  completionRate: number;
  fraudScore: number;
  warningCount: number;
  isFlagged: boolean;
  isSuspended: boolean;
  suspensionReason: string;
  autoSuspend: boolean;
  fraudLevel: "Low" | "Medium" | "High" | "Critical";
  lastRideCancelledAt?: Date;
  lastFraudCheckedAt?: Date;
  suspendedAt?: Date;
  suspensionEndsAt?: Date;
  save(options?: mongoose.SaveOptions): Promise<this>;
}

interface IFraudLog {
  bookingId: string;
  userId: mongoose.Types.ObjectId;
  rideId: mongoose.Types.ObjectId;
  rideCode: string;
  action: string;
  fraudScoreChange: number;
  reason: string;
}

export class RideFraudService {
  private readonly FRAUD_THRESHOLDS = {
    CANCELLATION_RATE: 0.3,
    REJECTION_RATE: 0.5,
    TIMEOUT_RATE: 0.4,
    FRAUD_SCORE_HIGH: 50,
    FRAUD_SCORE_CRITICAL: 75,
    WARNING_THRESHOLD: 3,
    SUSPENSION_THRESHOLD: -30,
    SUSPENSION_DURATION_HOURS: 24,
    MAX_LOGS_RETURN: 100,
  } as const;

  private readonly FRAUD_WEIGHTS = {
    ACCEPTED: 2,
    COMPLETED: 3,
    CANCELLED: -10,
    REJECTED: -5,
    TIMEOUT: -3,
  } as const;

  // ✅ Helper to ensure suspensionReason is never empty
  private ensureSuspensionReason(fraud: any): void {
    if (!fraud.suspensionReason || fraud.suspensionReason.trim() === "") {
      fraud.suspensionReason = "No suspension reason provided";
    }
  }

  async initializeDriverFraud(
    userId: mongoose.Types.ObjectId | string,
  ): Promise<void> {
    const validatedUserId = this.validateObjectId(userId);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const existing = await RideDriverFraud.findOne({
        userId: validatedUserId,
      }).session(session);

      if (!existing) {
        const fraud = new RideDriverFraud({
          userId: validatedUserId,
          totalAcceptedRides: 0,
          totalCompletedRides: 0,
          totalCancelledRides: 0,
          totalRejectedRequests: 0,
          totalTimeoutRequests: 0,
          cancellationRate: 0,
          completionRate: 100,
          fraudScore: 0,
          warningCount: 0,
          isFlagged: false,
          isSuspended: false,
          suspensionReason: "Initial driver fraud record created",
          autoSuspend: true,
          fraudLevel: "Low",
        });

        await fraud.save({ session });
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async recordDriverAction(action: IFraudAction): Promise<void> {
    const validatedUserId = this.validateObjectId(action.userId);
    const validatedRideId = this.validateObjectId(action.rideId);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      let fraud = await RideDriverFraud.findOne({
        userId: validatedUserId,
      }).session(session);

      if (!fraud) {
        await this.initializeDriverFraud(validatedUserId);
        fraud = await RideDriverFraud.findOne({
          userId: validatedUserId,
        }).session(session);

        if (!fraud) {
          throw new Error("Failed to initialize or find fraud record");
        }
      }

      // ✅ Ensure suspensionReason has a value before saving
      this.ensureSuspensionReason(fraud);

      await this.processFraudAction(
        fraud as IFraudDocument,
        {
          ...action,
          userId: validatedUserId,
          rideId: validatedRideId,
        },
        session,
      );

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private async processFraudAction(
    fraud: IFraudDocument,
    action: IFraudAction,
    session: mongoose.ClientSession,
  ): Promise<void> {
    let fraudScoreChange = 0;
    let reason = "";

    switch (action.action) {
      case "accepted":
        fraud.totalAcceptedRides += 1;
        fraudScoreChange = this.FRAUD_WEIGHTS.ACCEPTED;
        reason = "Ride accepted successfully";
        break;

      case "completed":
        fraud.totalCompletedRides += 1;
        fraudScoreChange = this.FRAUD_WEIGHTS.COMPLETED;
        reason = "Ride completed successfully";
        break;

      case "cancelled":
        fraud.totalCancelledRides += 1;
        fraudScoreChange = this.FRAUD_WEIGHTS.CANCELLED;
        fraud.lastRideCancelledAt = new Date();
        reason = "Ride cancelled by driver";
        await this.handleCancellation(fraud, action, session);
        break;

      case "rejected":
        fraud.totalRejectedRequests += 1;
        fraudScoreChange = this.FRAUD_WEIGHTS.REJECTED;
        reason = "Ride request rejected";
        await this.handleRejection(fraud, action, session);
        break;

      case "timeout":
        fraud.totalTimeoutRequests += 1;
        fraudScoreChange = this.FRAUD_WEIGHTS.TIMEOUT;
        reason = "Ride request timed out";
        await this.handleTimeout(fraud, action, session);
        break;

      default:
        throw new Error(`Unknown action type: ${action.action}`);
    }

    const newTotalRequests =
      fraud.totalAcceptedRides +
      fraud.totalRejectedRequests +
      fraud.totalTimeoutRequests +
      fraud.totalCancelledRides;

    if (newTotalRequests > 0) {
      fraud.cancellationRate = fraud.totalCancelledRides / newTotalRequests;
      fraud.completionRate = fraud.totalCompletedRides / newTotalRequests;
    }

    fraud.fraudScore += fraudScoreChange;
    fraud.fraudScore = Math.max(-100, Math.min(100, fraud.fraudScore));
    fraud.lastFraudCheckedAt = new Date();
    fraud.fraudLevel = this.calculateFraudLevel(fraud.fraudScore);
    fraud.isFlagged =
      fraud.fraudLevel === "High" || fraud.fraudLevel === "Critical";

    // ✅ Ensure suspensionReason has a value before saving
    this.ensureSuspensionReason(fraud);

    await fraud.save({ session });

    await this.logFraudAction(
      {
        bookingId: action.bookingId,
        userId: fraud.userId,
        rideId: action.rideId as mongoose.Types.ObjectId,
        rideCode: action.rideCode,
        action: action.action,
        fraudScoreChange,
        reason,
      },
      session,
    );

    if (fraud.autoSuspend) {
      await this.checkAutoSuspension(fraud, session);
    }
  }

  private async handleCancellation(
    fraud: IFraudDocument,
    action: IFraudAction,
    session: mongoose.ClientSession,
  ): Promise<void> {
    fraud.warningCount += 1;

    if (fraud.warningCount >= this.FRAUD_THRESHOLDS.WARNING_THRESHOLD) {
      fraud.isFlagged = true;
      fraud.warningCount = 0;

      await this.logFraudAction(
        {
          bookingId: action.bookingId,
          userId: fraud.userId,
          rideId: action.rideId as mongoose.Types.ObjectId,
          rideCode: action.rideCode,
          action: "cancelled",
          fraudScoreChange: -5,
          reason: "Multiple cancellations detected",
        },
        session,
      );
    }

    const totalRequests =
      fraud.totalAcceptedRides +
      fraud.totalRejectedRequests +
      fraud.totalTimeoutRequests +
      fraud.totalCancelledRides;

    if (totalRequests > 0) {
      const cancellationRate = fraud.totalCancelledRides / totalRequests;
      if (cancellationRate > this.FRAUD_THRESHOLDS.CANCELLATION_RATE) {
        fraud.isFlagged = true;

        await this.logFraudAction(
          {
            bookingId: action.bookingId,
            userId: fraud.userId,
            rideId: action.rideId as mongoose.Types.ObjectId,
            rideCode: action.rideCode,
            action: "cancelled",
            fraudScoreChange: -10,
            reason: `High cancellation rate: ${(cancellationRate * 100).toFixed(1)}%`,
          },
          session,
        );
      }
    }
  }

  private async handleRejection(
    fraud: IFraudDocument,
    action: IFraudAction,
    session: mongoose.ClientSession,
  ): Promise<void> {
    const totalRequests =
      fraud.totalAcceptedRides +
      fraud.totalRejectedRequests +
      fraud.totalTimeoutRequests +
      fraud.totalCancelledRides;

    if (totalRequests > 0) {
      const rejectionRate = fraud.totalRejectedRequests / totalRequests;
      if (rejectionRate > this.FRAUD_THRESHOLDS.REJECTION_RATE) {
        fraud.isFlagged = true;

        await this.logFraudAction(
          {
            bookingId: action.bookingId,
            userId: fraud.userId,
            rideId: action.rideId as mongoose.Types.ObjectId,
            rideCode: action.rideCode,
            action: "rejected",
            fraudScoreChange: -10,
            reason: `High rejection rate: ${(rejectionRate * 100).toFixed(1)}%`,
          },
          session,
        );
      }
    }
  }

  private async handleTimeout(
    fraud: IFraudDocument,
    action: IFraudAction,
    session: mongoose.ClientSession,
  ): Promise<void> {
    const totalRequests =
      fraud.totalAcceptedRides +
      fraud.totalRejectedRequests +
      fraud.totalTimeoutRequests +
      fraud.totalCancelledRides;

    if (totalRequests > 0) {
      const timeoutRate = fraud.totalTimeoutRequests / totalRequests;
      if (timeoutRate > this.FRAUD_THRESHOLDS.TIMEOUT_RATE) {
        fraud.isFlagged = true;

        await this.logFraudAction(
          {
            bookingId: action.bookingId,
            userId: fraud.userId,
            rideId: action.rideId as mongoose.Types.ObjectId,
            rideCode: action.rideCode,
            action: "timeout",
            fraudScoreChange: -5,
            reason: `High timeout rate: ${(timeoutRate * 100).toFixed(1)}%`,
          },
          session,
        );
      }
    }
  }

  private async logFraudAction(
    logData: IFraudLog,
    session: mongoose.ClientSession,
  ): Promise<void> {
    const log = new RideDriverFraudLog({
      bookingId: logData.bookingId,
      userId: logData.userId,
      rideId: logData.rideId,
      rideCode: logData.rideCode,
      action: logData.action,
      fraudScoreChange: logData.fraudScoreChange,
      reason: logData.reason,
    });

    await log.save({ session });
  }

  private async checkAutoSuspension(
    fraud: IFraudDocument,
    session: mongoose.ClientSession,
  ): Promise<void> {
    const shouldSuspend =
      fraud.fraudScore < this.FRAUD_THRESHOLDS.SUSPENSION_THRESHOLD ||
      fraud.fraudLevel === "Critical";

    // ✅ Always set meaningful suspension reason
    if (shouldSuspend && !fraud.isSuspended) {
      fraud.isSuspended = true;
      fraud.suspensionReason = `Auto-suspended due to fraud score: ${fraud.fraudScore} | Level: ${fraud.fraudLevel}`;
      fraud.suspendedAt = new Date();
      fraud.suspensionEndsAt = new Date(
        Date.now() +
          this.FRAUD_THRESHOLDS.SUSPENSION_DURATION_HOURS * 60 * 60 * 1000,
      );

      await this.logFraudAction(
        {
          bookingId: "SYSTEM",
          userId: fraud.userId,
          rideId: new mongoose.Types.ObjectId(),
          rideCode: "SUSPENSION",
          action: "cancelled",
          fraudScoreChange: -20,
          reason: `Driver auto-suspended due to fraudulent activity. Score: ${fraud.fraudScore}`,
        },
        session,
      );

      await fraud.save({ session });
    }

    if (fraud.isSuspended && fraud.suspensionEndsAt) {
      const now = new Date();
      if (now >= fraud.suspensionEndsAt) {
        fraud.isSuspended = false;
        fraud.suspensionReason =
          "Suspension period expired. Driver automatically unsuspended.";
        fraud.suspensionEndsAt = undefined;
        fraud.suspendedAt = undefined;

        await this.logFraudAction(
          {
            bookingId: "SYSTEM",
            userId: fraud.userId,
            rideId: new mongoose.Types.ObjectId(),
            rideCode: "UNSUSPEND",
            action: "accepted",
            fraudScoreChange: 5,
            reason: "Driver automatically unsuspended after suspension period",
          },
          session,
        );

        await fraud.save({ session });
      }
    }

    // ✅ Always ensure suspensionReason is not empty
    this.ensureSuspensionReason(fraud);
  }

  private calculateFraudLevel(
    score: number,
  ): "Low" | "Medium" | "High" | "Critical" {
    if (score >= this.FRAUD_THRESHOLDS.FRAUD_SCORE_CRITICAL) return "Critical";
    if (score >= this.FRAUD_THRESHOLDS.FRAUD_SCORE_HIGH) return "High";
    if (score >= 20) return "Medium";
    return "Low";
  }

  async getDriverFraudStatus(
    userId: mongoose.Types.ObjectId | string,
  ): Promise<IFraudDocument> {
    const validatedUserId = this.validateObjectId(userId);

    let fraud = await RideDriverFraud.findOne({ userId: validatedUserId });

    if (!fraud) {
      await this.initializeDriverFraud(validatedUserId);
      fraud = await RideDriverFraud.findOne({ userId: validatedUserId });

      if (!fraud) {
        throw new Error("Failed to initialize or retrieve fraud status");
      }
    }

    // ✅ Ensure suspensionReason has a value
    this.ensureSuspensionReason(fraud);

    return fraud as IFraudDocument;
  }

  async getFraudLogs(
    userId: mongoose.Types.ObjectId | string,
    limit: number = 50,
  ): Promise<any[]> {
    const validatedUserId = this.validateObjectId(userId);
    const maxLimit = Math.min(limit, this.FRAUD_THRESHOLDS.MAX_LOGS_RETURN);

    return RideDriverFraudLog.find({ userId: validatedUserId })
      .sort({ createdAt: -1 })
      .limit(maxLimit)
      .lean()
      .exec();
  }

  async resetFraudScore(
    userId: mongoose.Types.ObjectId | string,
  ): Promise<void> {
    const validatedUserId = this.validateObjectId(userId);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const fraud = await RideDriverFraud.findOne({
        userId: validatedUserId,
      }).session(session);

      if (fraud) {
        fraud.fraudScore = 0;
        fraud.fraudLevel = "Low";
        fraud.isFlagged = false;
        fraud.warningCount = 0;

        if (fraud.isSuspended) {
          fraud.isSuspended = false;
          fraud.suspensionReason = "Fraud score reset by administrator";
          fraud.suspensionEndsAt = undefined;
          fraud.suspendedAt = undefined;
        }

        // ✅ Ensure suspensionReason has a value
        this.ensureSuspensionReason(fraud);

        await fraud.save({ session });

        await this.logFraudAction(
          {
            bookingId: "SYSTEM",
            userId: validatedUserId,
            rideId: new mongoose.Types.ObjectId(),
            rideCode: "RESET",
            action: "accepted",
            fraudScoreChange: 0,
            reason: "Fraud score manually reset by administrator",
          },
          session,
        );
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async getFraudStatistics(): Promise<any> {
    const [
      totalDrivers,
      flaggedDrivers,
      suspendedDrivers,
      averageScore,
      highRiskDrivers,
    ] = await Promise.all([
      RideDriverFraud.countDocuments(),
      RideDriverFraud.countDocuments({ isFlagged: true }),
      RideDriverFraud.countDocuments({ isSuspended: true }),
      RideDriverFraud.aggregate([
        { $group: { _id: null, avgScore: { $avg: "$fraudScore" } } },
      ]),
      RideDriverFraud.countDocuments({
        fraudLevel: { $in: ["High", "Critical"] },
      }),
    ]);

    return {
      totalDrivers,
      flaggedDrivers,
      suspendedDrivers,
      highRiskDrivers,
      averageScore: averageScore[0]?.avgScore || 0,
      fraudLevelDistribution: await this.getFraudLevelDistribution(),
    };
  }

  private async getFraudLevelDistribution(): Promise<Record<string, number>> {
    const distribution = await RideDriverFraud.aggregate([
      { $group: { _id: "$fraudLevel", count: { $sum: 1 } } },
    ]);

    const result: Record<string, number> = {};
    for (const item of distribution) {
      result[item._id] = item.count;
    }

    return result;
  }

  async checkDriverSuspensionStatus(
    userId: mongoose.Types.ObjectId | string,
  ): Promise<{ isSuspended: boolean; reason?: string; endsAt?: Date }> {
    const validatedUserId = this.validateObjectId(userId);

    const fraud = await RideDriverFraud.findOne({ userId: validatedUserId });

    if (!fraud) {
      return { isSuspended: false };
    }

    if (fraud.isSuspended && fraud.suspensionEndsAt) {
      const now = new Date();
      if (now >= fraud.suspensionEndsAt) {
        fraud.isSuspended = false;
        fraud.suspensionReason =
          "Suspension period expired. Driver automatically unsuspended.";
        fraud.suspensionEndsAt = undefined;
        fraud.suspendedAt = undefined;
        await fraud.save();
        return { isSuspended: false };
      }
    }

    return {
      isSuspended: fraud.isSuspended,
      reason: fraud.suspensionReason || undefined,
      endsAt: fraud.suspensionEndsAt || undefined,
    };
  }

  private validateObjectId(
    id: mongoose.Types.ObjectId | string | any,
  ): mongoose.Types.ObjectId {
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    throw new Error(`Invalid ObjectId: ${String(id)}`);
  }
}
