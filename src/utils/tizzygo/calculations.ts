import { DeliveryBreakdown } from "../../types/tizzygo/buyer";

export const DELIVERY_RATE_PER_KM = 3.3;
export const DELIVERY_RATE_PER_KG = 5.5;
export const COUPON_SERVICE_URL = "http://172.20.10.12:6060";

// ============================================================
// UNIT CONVERSION HELPERS
// ============================================================

export const convertWeightToKg = (weight: number, unit: string): number => {
  const weightNum = Number(weight) || 0;
  switch (unit?.toUpperCase()) {
    case "KG":
      return weightNum;
    case "GRAM":
    case "G":
      return weightNum / 1000;
    case "LB":
      return weightNum * 0.453592;
    default:
      return weightNum; // Assume KG
  }
};

export const convertDimensionToCm = (value: number, unit: string): number => {
  const valueNum = Number(value) || 0;
  switch (unit?.toUpperCase()) {
    case "CM":
      return valueNum;
    case "INCH":
      return valueNum * 2.54;
    case "M":
      return valueNum * 100;
    case "FT":
      return valueNum * 30.48;
    default:
      return valueNum; // Assume CM
  }
};

// ============================================================
// GST CALCULATION WITH TYPE SUPPORT
// ============================================================

export const calculateGST = (
  price: number,
  gstRate: number,
  gstType: string = "INCLUSIVE",
): { gstAmount: number; basePrice: number; priceWithGST: number } => {
  const rate = Number(gstRate) || 0;
  const originalPrice = Number(price) || 0;

  if (gstType?.toUpperCase() === "EXCLUSIVE") {
    // EXCLUSIVE: Price is without GST, add GST on top
    const gstAmount = (originalPrice * rate) / 100;
    return {
      gstAmount: Math.round(gstAmount * 100) / 100,
      basePrice: originalPrice,
      priceWithGST: originalPrice + gstAmount,
    };
  } else {
    // INCLUSIVE: Price includes GST, back-calculate
    const basePrice = (originalPrice * 100) / (100 + rate);
    const gstAmount = originalPrice - basePrice;
    return {
      gstAmount: Math.round(gstAmount * 100) / 100,
      basePrice: Math.round(basePrice * 100) / 100,
      priceWithGST: originalPrice,
    };
  }
};

// ============================================================
// VOLUMETRIC WEIGHT CALCULATIONS
// ============================================================

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

// ============================================================
// DELIVERY CHARGE CALCULATIONS
// ============================================================

export const calculateDeliveryChargeWithBreakdown = (
  distanceKm: number,
  chargeableWeight: number,
): { deliveryCharge: number; breakdown: DeliveryBreakdown } => {
  const distanceCharge = distanceKm * DELIVERY_RATE_PER_KM;
  const weightCharge = chargeableWeight * DELIVERY_RATE_PER_KG;
  const deliveryChargeRaw = distanceCharge + weightCharge;
  const roundedCharge = Math.round(deliveryChargeRaw);

  const breakdown: DeliveryBreakdown = {
    formula: `(${distanceKm} km × ₹${DELIVERY_RATE_PER_KM}) + (${chargeableWeight} kg × ₹${DELIVERY_RATE_PER_KG}) = ₹${roundedCharge}`,
    distance: distanceKm,
    rate: DELIVERY_RATE_PER_KM,
    weight: chargeableWeight,
    subtotal: roundedCharge,
  };

  return { deliveryCharge: roundedCharge, breakdown };
};

// ============================================================
// PRICE CALCULATIONS WITH GST TYPE SUPPORT
// ============================================================

export const calculatePrices = (
  mrp: number,
  finalPrice: number,
  quantity: number,
  gstRate: number,
  gstType: string = "INCLUSIVE",
) => {
  const savedAmount = mrp - finalPrice;
  const discountPercent = mrp > 0 ? (savedAmount / mrp) * 100 : 0;
  const totalMrp = mrp * quantity;
  const totalFinalPrice = finalPrice * quantity;
  const totalSavedAmount = savedAmount * quantity;

  // Calculate GST based on type
  let perProductGst: number;
  let totalGstAmount: number;
  let subtotal: number;

  if (gstType?.toUpperCase() === "EXCLUSIVE") {
    // EXCLUSIVE: GST is added on top of finalPrice
    perProductGst = (finalPrice * gstRate) / 100;
    totalGstAmount = perProductGst * quantity;
    subtotal = totalFinalPrice + totalGstAmount;
  } else {
    // INCLUSIVE: GST is already included in finalPrice
    perProductGst = (finalPrice * gstRate) / (100 + gstRate);
    totalGstAmount = perProductGst * quantity;
    subtotal = totalFinalPrice; // GST already included
  }

  return {
    savedAmount: Math.round(savedAmount * 100) / 100,
    discountPercent: parseFloat(discountPercent.toFixed(2)),
    totalMrp: Math.round(totalMrp * 100) / 100,
    totalFinalPrice: Math.round(totalFinalPrice * 100) / 100,
    totalSavedAmount: Math.round(totalSavedAmount * 100) / 100,
    perProductGst: Math.round(perProductGst * 100) / 100,
    totalGstAmount: Math.round(totalGstAmount * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    gstType: gstType.toUpperCase(),
  };
};
