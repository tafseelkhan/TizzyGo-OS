// types/tracking.types.ts
import { Request } from "express";

export interface AuthRequest extends Request {
  user?: {
    _id: string;
    userId: string;
    roles?: string;
    email?: string;
  };
}

export interface CreateTrackingDTO {
  orderId: string;
  riderId?: string;
  truckId?: string;
  assignmentType?: "RIDER" | "TRUCK";
}

export interface AssignRiderDTO {
  orderId: string;
  riderId: string;
  sellerId: string;
}

export interface AssignTruckDTO {
  orderId: string;
  truckId: string;
  fwsCode: string;
}

export interface QRVerificationDTO {
  orderId: string;
  sellerId: string;
  buyerId: string;
  generatedAt: Date;
  dispatchId: string;
}

export interface LocationUpdateDTO {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface TrackingEventDTO {
  status: string;
  holderType: "SELLER" | "RIDER" | "FWS" | "TRUCK";
  holderId?: string;
  holderName?: string;
  note?: string;
  fromLocation?: any;
  toLocation?: any;
}

// src/modules/tracking/tracking.types.ts

export type HolderType = "SELLER" | "RIDER" | "TRUCK" | "FWS" | "BUYER";

export interface ICoordinates {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface IDeliveryTracking {
  orderId: string;
  currentHolderType: HolderType;
  currentHolderId: string;
  currentLocation: ICoordinates & { updatedAt: Date };
  handoverHistory?: Array<{
    fromHolderType: HolderType;
    fromHolderId: string;
    toHolderType: HolderType;
    toHolderId: string;
    timestamp: Date;
    location?: ICoordinates;
  }>;
  status: "pending" | "in_transit" | "delivered" | "cancelled";
}

export interface IProximityCheckResponse {
  success: boolean;
  withinRange: boolean;
  distanceMeters: number;
  maxDistanceMeters: number;
  currentHolderType: HolderType;
  currentHolderId: string;
  targetHolderType: HolderType;
  targetHolderId: string;
  currentLocation: ICoordinates;
  targetLocation: ICoordinates;
  message?: string;
}

export interface ILiveTrackingResponse {
  success: boolean;
  data: {
    orderId: string;
    currentStatus: string;
    currentHolderType: HolderType;
    currentHolderName: string;
    latitude: number;
    longitude: number;
    address?: string;
    updatedAt: Date;
    estimatedDelivery?: Date;
  } | null;
  message?: string;
}

export interface IHolderInfo {
  id: string;
  name: string;
  location: ICoordinates;
  type: HolderType;
}
