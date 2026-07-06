// services/tizzyos/cab/rideRequestService.ts

import mongoose from "mongoose";
import RideRequest from "../../../models/tizzyos/cab/rideRequest";

interface IBooking {
  _id: mongoose.Types.ObjectId;
  bookingId: string;
  customerId: mongoose.Types.ObjectId;
  driverId?: mongoose.Types.ObjectId;
  pickup: any;
  destination: any;
  distance?: number;
  fare?: any;
  rideCode: string;
  status: string;
  [key: string]: any;
}

interface IDriver {
  userId: mongoose.Types.ObjectId;
  distance: number;
  [key: string]: any;
}

interface IRequestData {
  bookingId: string;
  rideId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  driverId: mongoose.Types.ObjectId;
  status: "pending" | "accepted" | "rejected" | "timeout" | "cancelled";
  batchNumber: number;
  distanceFromPickup: number;
  requestedAt: Date;
  expiresAt: Date;
  respondedAt?: Date;
}

interface IUpdateData {
  status?: "pending" | "accepted" | "rejected" | "timeout" | "cancelled";
  respondedAt?: Date;
  distanceFromPickup?: number;
  expiresAt?: Date;
  [key: string]: any;
}

export class RideRequestService {
  private readonly REQUEST_TIMEOUT_MS = 20000;
  private readonly MAX_BATCH_SIZE = 10;

  async createBatchRequests(
    booking: IBooking,
    drivers: IDriver[],
    batchNumber: number,
    session: mongoose.ClientSession,
  ): Promise<any[]> {
    if (!booking || !booking.bookingId) {
      throw new Error("Invalid booking data");
    }

    if (!drivers || drivers.length === 0) {
      throw new Error("No drivers provided");
    }

    if (batchNumber < 0) {
      throw new Error("Invalid batch number");
    }

    const limitedDrivers = drivers.slice(0, this.MAX_BATCH_SIZE);
    const requests: any[] = [];

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.REQUEST_TIMEOUT_MS);

    for (const driver of limitedDrivers) {
      const requestData: IRequestData = {
        bookingId: booking.bookingId,
        rideId: booking._id,
        customerId: booking.customerId,
        driverId: driver.userId,
        status: "pending",
        batchNumber,
        distanceFromPickup: Math.round((driver.distance / 1000) * 100) / 100,
        requestedAt: now,
        expiresAt: expiresAt,
      };

      const request = new RideRequest(requestData);
      await request.save({ session });
      requests.push(request);
    }

    return requests;
  }

  async acceptRequest(
    requestId: string,
    session: mongoose.ClientSession,
  ): Promise<any> {
    if (!requestId || typeof requestId !== "string") {
      throw new Error("Invalid request ID");
    }

    if (!session) {
      throw new Error("Session is required");
    }

    const request = await RideRequest.findOne({ _id: requestId }).session(
      session,
    );

    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }

    if (request.status !== "pending") {
      throw new Error(
        `Request is not pending. Current status: ${request.status}`,
      );
    }

    const now = new Date();
    if (request.expiresAt && request.expiresAt < now) {
      throw new Error("Request has expired");
    }

    request.status = "accepted";
    request.respondedAt = now;

    await request.save({ session });

    return request.toObject();
  }

  async rejectRequest(
    requestId: string,
    session: mongoose.ClientSession,
  ): Promise<any> {
    if (!requestId || typeof requestId !== "string") {
      throw new Error("Invalid request ID");
    }

    if (!session) {
      throw new Error("Session is required");
    }

    const request = await RideRequest.findOne({ _id: requestId }).session(
      session,
    );

    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }

    if (request.status !== "pending") {
      throw new Error(
        `Request is not pending. Current status: ${request.status}`,
      );
    }

    const now = new Date();
    if (request.expiresAt && request.expiresAt < now) {
      throw new Error("Request has expired");
    }

    request.status = "rejected";
    request.respondedAt = now;

    await request.save({ session });

    return request.toObject();
  }

  async updateRequest(
    requestId: string,
    updateData: IUpdateData,
  ): Promise<any> {
    if (!requestId || typeof requestId !== "string") {
      throw new Error("Invalid request ID");
    }

    if (!updateData || Object.keys(updateData).length === 0) {
      throw new Error("Update data is required");
    }

    const sanitizedData = this.sanitizeUpdateData(updateData);

    const request = await RideRequest.findOneAndUpdate(
      { _id: requestId },
      { $set: sanitizedData },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }

    return request.toObject();
  }

  async getRequest(requestId: string): Promise<any> {
    if (!requestId || typeof requestId !== "string") {
      throw new Error("Invalid request ID");
    }

    const request = await RideRequest.findOne({ _id: requestId }).lean().exec();

    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }

    return request;
  }

  async getRequestByDriverAndBooking(
    driverId: mongoose.Types.ObjectId | string,
    bookingId: string,
  ): Promise<any> {
    const validatedDriverId = this.validateObjectId(driverId);

    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    const request = await RideRequest.findOne({
      driverId: validatedDriverId,
      bookingId: bookingId,
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return request;
  }

  async cancelPendingRequests(
    bookingId: string,
    excludeDriverId: mongoose.Types.ObjectId | string,
    session: mongoose.ClientSession,
  ): Promise<number> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    const validatedExcludeDriverId = this.validateObjectId(excludeDriverId);

    if (!session) {
      throw new Error("Session is required");
    }

    const result = await RideRequest.updateMany(
      {
        bookingId,
        status: "pending",
        driverId: { $ne: validatedExcludeDriverId },
      },
      {
        $set: {
          status: "cancelled",
          respondedAt: new Date(),
        },
      },
      {
        session,
        runValidators: true,
      },
    );

    return result.modifiedCount || 0;
  }

  async getRequestsByBooking(bookingId: string): Promise<any[]> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    return RideRequest.find({ bookingId })
      .sort({ batchNumber: 1, createdAt: 1 })
      .lean()
      .exec();
  }

  async getRequestsByDriver(
    driverId: mongoose.Types.ObjectId | string,
  ): Promise<any[]> {
    const validatedDriverId = this.validateObjectId(driverId);

    return RideRequest.find({ driverId: validatedDriverId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async getPendingRequestsByDriver(
    driverId: mongoose.Types.ObjectId | string,
  ): Promise<any[]> {
    const validatedDriverId = this.validateObjectId(driverId);

    const now = new Date();

    return RideRequest.find({
      driverId: validatedDriverId,
      status: "pending",
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
  }

  async getRequestsByBatch(
    bookingId: string,
    batchNumber: number,
  ): Promise<any[]> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    if (batchNumber < 0) {
      throw new Error("Invalid batch number");
    }

    return RideRequest.find({
      bookingId,
      batchNumber,
    })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
  }

  async getRequestStats(bookingId: string): Promise<{
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    timeout: number;
    cancelled: number;
  }> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    const stats = await RideRequest.aggregate([
      {
        $match: { bookingId },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {
      total: 0,
      pending: 0,
      accepted: 0,
      rejected: 0,
      timeout: 0,
      cancelled: 0,
    };

    for (const stat of stats) {
      const status = stat._id;
      const count = stat.count;
      result.total += count;

      if (status === "pending") result.pending = count;
      else if (status === "accepted") result.accepted = count;
      else if (status === "rejected") result.rejected = count;
      else if (status === "timeout") result.timeout = count;
      else if (status === "cancelled") result.cancelled = count;
    }

    return result;
  }

  async expirePendingRequests(): Promise<number> {
    const now = new Date();

    const result = await RideRequest.updateMany(
      {
        status: "pending",
        expiresAt: { $lt: now },
      },
      {
        $set: {
          status: "timeout",
          respondedAt: now,
        },
      },
    );

    return result.modifiedCount || 0;
  }

  async getRequestByRideAndDriver(
    rideId: mongoose.Types.ObjectId | string,
    driverId: mongoose.Types.ObjectId | string,
  ): Promise<any> {
    const validatedRideId = this.validateObjectId(rideId);
    const validatedDriverId = this.validateObjectId(driverId);

    const request = await RideRequest.findOne({
      rideId: validatedRideId,
      driverId: validatedDriverId,
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return request;
  }

  async getResponseRate(driverId: mongoose.Types.ObjectId | string): Promise<{
    totalRequests: number;
    accepted: number;
    rejected: number;
    timeout: number;
    responseRate: number;
  }> {
    const validatedDriverId = this.validateObjectId(driverId);

    const stats = await RideRequest.aggregate([
      {
        $match: {
          driverId: validatedDriverId,
          status: { $in: ["accepted", "rejected", "timeout"] },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {
      totalRequests: 0,
      accepted: 0,
      rejected: 0,
      timeout: 0,
      responseRate: 0,
    };

    for (const stat of stats) {
      const status = stat._id;
      const count = stat.count;
      result.totalRequests += count;

      if (status === "accepted") result.accepted = count;
      else if (status === "rejected") result.rejected = count;
      else if (status === "timeout") result.timeout = count;
    }

    if (result.totalRequests > 0) {
      result.responseRate = (result.accepted / result.totalRequests) * 100;
    }

    return result;
  }

  async batchUpdateRequests(
    bookingId: string,
    status: string,
    driverIds?: mongoose.Types.ObjectId[],
  ): Promise<number> {
    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Invalid booking ID");
    }

    if (!status || typeof status !== "string") {
      throw new Error("Invalid status");
    }

    const query: any = { bookingId };

    if (driverIds && driverIds.length > 0) {
      query.driverId = { $in: driverIds };
    }

    const result = await RideRequest.updateMany(
      query,
      {
        $set: {
          status,
          respondedAt: new Date(),
        },
      },
      {
        runValidators: true,
      },
    );

    return result.modifiedCount || 0;
  }

  private sanitizeUpdateData(data: IUpdateData): IUpdateData {
    const sanitized: IUpdateData = {};

    const allowedFields = [
      "status",
      "respondedAt",
      "distanceFromPickup",
      "expiresAt",
    ];

    for (const [key, value] of Object.entries(data)) {
      if (
        allowedFields.includes(key) &&
        value !== undefined &&
        value !== null
      ) {
        if (key === "status") {
          const validStatuses = [
            "pending",
            "accepted",
            "rejected",
            "timeout",
            "cancelled",
          ];
          if (validStatuses.includes(value as string)) {
            sanitized[key] = value;
          }
        } else if (key === "respondedAt" || key === "expiresAt") {
          if (value instanceof Date || typeof value === "string") {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              sanitized[key] = date;
            }
          }
        } else if (key === "distanceFromPickup") {
          if (typeof value === "number" && value >= 0) {
            sanitized[key] = Math.round(value * 100) / 100;
          }
        } else {
          sanitized[key] = value;
        }
      }
    }

    return sanitized;
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

  async cleanupExpiredRequests(): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await RideRequest.deleteMany({
      status: { $in: ["cancelled", "timeout", "rejected"] },
      createdAt: { $lt: thirtyDaysAgo },
    });

    return result.deletedCount || 0;
  }
}
