export interface DeliveryBreakdown {
  formula: string;
  distance: number;
  rate: number;
  weight: number;
  subtotal: number;
}

export interface CalculatedData {
  mrp: number;
  price: number;
  finalPrice: number;
  savedAmount: number;
  discountPercent: number;
  quantity: number;
  totalMrp: number;
  totalFinalPrice: number;
  totalSavedAmount: number;
  gstRate: number;
  gstAmount: number;
  perProductGst: number;
  deliveryCharge: number;
  distanceKm: number;
  volumetricWeight: number;
  actualWeight: number;
  chargeableWeight: number;
  deliveryRatePerKmPerKg: number;
  deliveryCalculationBreakdown: DeliveryBreakdown;
  subtotal: number;
  totalBeforeCoupon: number;
  discountAppliedAmount: number;
  grandTotal: number;
  couponUsed: string | null;
  couponData: any;
  buyerLocation: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    googlePlaceId: string | null;
  };
  sellerLocation: {
    latitude: number;
    longitude: number;
    address: string | null;
    googlePlaceId: string | null;
  };
}
