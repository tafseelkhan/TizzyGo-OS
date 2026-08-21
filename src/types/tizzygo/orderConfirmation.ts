// ============================================================
// types/orderConfirmation.types.ts
// ============================================================

import { Types } from "mongoose";

export enum ConfirmationStatus {
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  PENDING = "PENDING",
  EXPIRED = "EXPIRED",
}

export enum PaymentMethod {
  ONLINE = "ONLINE",
  COD = "COD",
}

export interface TimerInfo {
  serverTime: string;
  createdAt: string;
  completedAt?: string;
  expiresAt: string;
  remainingMilliseconds: number;
  remainingSeconds: number;
  remainingMinutes: number;
  isExpired: boolean;
}

export interface OrderSummary {
  subtotal: number;
  gst: number;
  platformFee: number;
  deliveryCharge: number;
  discount: number;
  grandTotal: number;
}

export interface OrderConfirmationOrder {
  _id: string;
  orderId: string;
  status: string;
  paymentStatus: string;
  sellerId: string;
  sellerName: string;
  productTitle: string;
  productImage: string;
  quantity: number;
  variant?: string;
  price: number;
  trackingAvailable: boolean;
}

export interface NavigationConfig {
  autoRedirect: boolean;
  redirectAfterSeconds: number;
}

export interface ButtonsConfig {
  canGoHome: boolean;
  canRetryPayment: boolean;
  canTrackOrder: boolean;
}

export interface OrderConfirmationResponse {
  success: boolean;
  confirmationStatus: ConfirmationStatus;
  paymentMethod: PaymentMethod;
  checkoutSession: {
    checkoutSessionId: string;
    status: string;
    paymentGateway: string;
    paymentIntentId?: string;
  };
  timer: TimerInfo;
  summary: OrderSummary;
  orders: OrderConfirmationOrder[];
  trackingAvailable: boolean;
  buttons: ButtonsConfig;
  navigation: NavigationConfig;
}
