import { Types } from "mongoose";

export interface CartProductCalculation {
  productId: string;
  sellerId: string;
  title: string;
  quantity: number;
  variantId?: string | null;
  calculated: {
    mrp: number;
    price: number;
    finalPrice: number;
    savedAmount: number;
    discountPercent: number;
    totalMrp: number;
    totalFinalPrice: number;
    totalSavedAmount: number;
    gstRate: number;
    gstType: string;
    gstAmount: number;
    perProductGst: number;
    platformFee: number;
    packagingFee: number;
    deliveryCharge: number;
    distanceKm: number;
    volumetricWeight: number;
    actualWeight: number;
    chargeableWeight: number;
    deliveryRatePerKm: number;
    deliveryRatePerKg: number;
    subtotal: number;
    totalBeforeCoupon: number;
    discountAppliedAmount: number;
    grandTotal: number;
    couponUsed: string | null;
    couponData: {
      discount: number;
      originalPrice: number;
      finalPrice: number;
      message?: string;
    } | null;
    buyerLocation: {
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      googlePlaceId: string | null;
    };
    sellerLocation: {
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      googlePlaceId: string | null;
    };
  };
}

export interface CartCheckoutSummary {
  subtotal: number;
  platformFee: number;
  packagingFee: number;
  deliveryCharge: number;
  discount: number;
  grandTotal: number;
}

export interface CartCheckoutResponse {
  hasLocation: boolean;
  products?: CartProductCalculation[];
  summary?: CartCheckoutSummary;
}

export interface CartCheckoutLocationRequest {
  address: string;
  latitude: number;
  longitude: number;
  googlePlaceId?: string;
  city?: string;
  state?: string;
  country?: string;
  pinCode?: string;
  label?: string;
}

export interface CartCheckoutParams {
  userId: string;
  address?: {
    address: string;
    latitude: number;
    longitude: number;
    googlePlaceId?: string;
    city?: string;
    state?: string;
    country?: string;
    pinCode?: string;
    landmark?: string;
    label?: string;
  };
  couponCode?: string;
}
export interface CartCheckoutParams {
  userId: string;
  address?: {
    address: string;
    latitude: number;
    longitude: number;
    googlePlaceId?: string;
    city?: string;
    state?: string;
    country?: string;
    pinCode?: string;
    landmark?: string;
    label?: string;
  };
  couponCode?: string;
}

export interface CartProductCalculation {
  productId: string;
  sellerId: string;
  title: string;
  quantity: number;
  calculated: {
    mrp: number;
    price: number;
    finalPrice: number;
    savedAmount: number;
    discountPercent: number;
    totalMrp: number;
    totalFinalPrice: number;
    totalSavedAmount: number;
    gstRate: number;
    gstType: string;
    gstAmount: number;
    perProductGst: number;
    platformFee: number;
    packagingFee: number;
    deliveryCharge: number;
    distanceKm: number;
    volumetricWeight: number;
    actualWeight: number;
    chargeableWeight: number;
    deliveryRatePerKm: number;
    deliveryRatePerKg: number;
    subtotal: number;
    totalBeforeCoupon: number;
    discountAppliedAmount: number;
    grandTotal: number;
    couponUsed: string | null;
    couponData: {
      discount: number;
      originalPrice: number;
      finalPrice: number;
      message?: string;
    } | null;
    buyerLocation: {
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      googlePlaceId: string | null;
    };
    sellerLocation: {
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      googlePlaceId: string | null;
    };
  };
}

export interface CartCheckoutSummary {
  subtotal: number;
  platformFee: number;
  packagingFee: number;
  deliveryCharge: number;
  discount: number;
  grandTotal: number;
}

export interface CartCheckoutResponse {
  hasLocation: boolean;
  products?: CartProductCalculation[];
  summary?: CartCheckoutSummary;
}

export interface CartCheckoutLocationRequest {
  address: string;
  latitude: number;
  longitude: number;
  googlePlaceId?: string;
  city?: string;
  state?: string;
  country?: string;
  pinCode?: string;
  label?: string;
  landmark?: string;
}