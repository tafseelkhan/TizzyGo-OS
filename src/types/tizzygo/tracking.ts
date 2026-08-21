// src/types/tizzygo/tracking.ts

export interface IAddressInfo {
  address: string;
  latitude: number;
  longitude: number;
  googlePlaceId?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export interface ITimelineEvent {
  status: string;
  displayStatus: string;
  holderType: "SELLER" | "RIDER" | "FWS" | "TRUCK" | "BUYER";
  holderName?: string;
  holderId?: string;
  timestamp: Date | string;
  note?: string;
  isCurrent?: boolean;
  isCompleted?: boolean;
}

export interface IOrderObject {
  _id: any;
  orderId: string;
  buyerId: string;
  sellerId: string;
  sellerName: string;
  sellerEmail?: string;
  sellerPhone?: string;
  buyerName: string;
  buyerEmail?: string;
  buyerPhone?: string;
  productTitle: string;
  productImage: string;
  productId?: string;
  productBrand?: string;
  productCategory?: string;
  variant?: any;
  quantity: number;
  price: number;
  finalAmount: number;
  totalAmount: number;
  paymentStatus: string;
  status: string;
  fulfillmentType: "SELLER" | "FWS";
  cashOnDelivery: boolean;
  shippingAddress: IAddressInfo;
  sellerAddress: IAddressInfo;
  trackingId?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ITrackingObject {
  trackingId: string;
  currentStatus: string;
  currentHolderType: string;
  currentHolderId: string;
  currentHolderName?: string;
  currentLocation?: any;
  currentFWS?: any;
  currentShipping?: any;
  routeHistory: any[];
  assignmentHistory: any[];
  qrOwnershipHistory: any[];
  trackingHistory: any[];
  totalFWSVisited: number;
  totalRidersInvolved: number;
  totalTrucksInvolved: number;
  deliveredAt?: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface IOrderTrackingResponse {
  trackingCreated: boolean;
  currentStatus: string;
  order: IOrderObject;
  tracking: ITrackingObject | null;
  buyerAddress: IAddressInfo;
  sellerAddress: IAddressInfo;
  riderLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
    updatedAt?: Date | string;
  } | null;
  riderName?: string | null;
  riderPhone?: string | null;
  riderRating?: number | null;
  shippingPartner?: {
    id: string;
    name: string | null;
    phone: string | null;
    type: string | null;
    location: {
      latitude: number;
      longitude: number;
      updatedAt?: Date | string;
    };
  } | null;
  fwsInfo?: {
    fwsCode: string;
    name: string;
    city: string;
    address: string;
    processingStage: string;
    updatedAt: Date | string;
  } | null;
  timeline: ITimelineEvent[];
  distance: number | null;
  eta: number | null;
  estimatedDelivery: string | null;
  isDelivered: boolean;
  isCancelled: boolean;
  trackingAvailable: boolean;
  message?: string;
}

export interface ITrackingUpdate {
  orderId: string;
  trackingId: string;
  currentStatus: string;
  currentHolderType: string;
  currentHolderId: string;
  currentLocation?: any;
  destinationLocation?: any;
  riderLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
    updatedAt?: Date | string;
  };
  timeline: ITimelineEvent[];
  estimatedDelivery?: string;
}
