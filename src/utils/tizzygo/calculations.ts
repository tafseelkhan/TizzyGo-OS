import { DeliveryBreakdown } from "../../types/tizzygo/buyer";

export const DELIVERY_RATE_PER_KM_PER_KG = 8;

export const COUPON_SERVICE_URL = "http://172.20.10.12:6060";

export const calculateVolumetricWeight = (
  length: number,
  width: number,
  height: number,
): number => {
  const l = Number(length) || 10;
  const w = Number(width) || 10;
  const h = Number(height) || 10;
  const volumetricWeight = (l * w * h) / 5000;
  return parseFloat(volumetricWeight.toFixed(2));
};

export const getChargeableWeight = (
  actualWeight: number,
  volumetricWeight: number,
): number => {
  const actual = Number(actualWeight) || 0.5;
  const volumetric = volumetricWeight || 0;
  const chargeable = Math.max(actual, volumetric);
  return parseFloat(chargeable.toFixed(2));
};

export const calculateDeliveryChargeWithBreakdown = (
  distanceKm: number,
  chargeableWeight: number,
): { deliveryCharge: number; breakdown: DeliveryBreakdown } => {
  const deliveryCharge =
    distanceKm * DELIVERY_RATE_PER_KM_PER_KG * chargeableWeight;
  const roundedCharge = Math.round(deliveryCharge * 100) / 100;

  const breakdown: DeliveryBreakdown = {
    formula: `${distanceKm} km × ₹${DELIVERY_RATE_PER_KM_PER_KG} × ${chargeableWeight} kg`,
    distance: distanceKm,
    rate: DELIVERY_RATE_PER_KM_PER_KG,
    weight: chargeableWeight,
    subtotal: roundedCharge,
  };

  return { deliveryCharge: roundedCharge, breakdown };
};

export const calculatePrices = (
  mrp: number,
  finalPrice: number,
  quantity: number,
  gstRate: number,
) => {
  const savedAmount = mrp - finalPrice;
  const discountPercent = mrp > 0 ? (savedAmount / mrp) * 100 : 0;
  const totalMrp = mrp * quantity;
  const totalFinalPrice = finalPrice * quantity;
  const totalSavedAmount = savedAmount * quantity;
  const perProductGst = (finalPrice * gstRate) / 100;
  const totalGstAmount = perProductGst * quantity;
  const subtotal = totalFinalPrice + totalGstAmount;

  return {
    savedAmount: Math.round(savedAmount * 100) / 100,
    discountPercent: parseFloat(discountPercent.toFixed(2)),
    totalMrp,
    totalFinalPrice,
    totalSavedAmount: Math.round(totalSavedAmount * 100) / 100,
    perProductGst: Math.round(perProductGst * 100) / 100,
    totalGstAmount: Math.round(totalGstAmount * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
  };
};
