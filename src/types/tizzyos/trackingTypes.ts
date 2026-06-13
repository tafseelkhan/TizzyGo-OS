// types/tracking.types.ts
import { Request } from "express";

export interface AuthRequest extends Request {
  user?: {
    _id: string;
    userId: string;
    role: string;
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
  fwsId: string;
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
