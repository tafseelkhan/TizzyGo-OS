import axios from "axios";
import {
  calculateVolumetricWeight,
  getChargeableWeight,
  calculateDeliveryChargeWithBreakdown,
  convertWeightToKg,
  convertDimensionToCm,
} from "../../utils/tizzygo/calculations";

export const getDistanceFromGoogle = async (
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<number> => {
  try {
    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/distancematrix/json",
      {
        params: {
          origins: `${originLat},${originLng}`,
          destinations: `${destLat},${destLng}`,
          key: process.env.GOOGLE_API_KEY,
        },
        timeout: 5000,
      },
    );

    const data = response.data;
    const meters = data.rows?.[0]?.elements?.[0]?.distance?.value || 0;
    const distanceKm = Math.round((meters / 1000) * 10) / 10;
    return distanceKm;
  } catch (error) {
    console.error("⚠️ Google Maps API error:", error);
    return 5;
  }
};

export const calculateDelivery = async (
  sellerLat: number,
  sellerLng: number,
  buyerLat: number | null,
  buyerLng: number | null,
  variant: any,
) => {
  // Get weight with unit conversion
  let weight = Number(variant.weight) || 0.5;
  const weightUnit = variant.weightUnit || "KG";
  const actualWeightKg = convertWeightToKg(weight, weightUnit);

  // Get dimensions with unit conversion
  let length = Number(variant.length) || 10;
  let width = Number(variant.width) || 10;
  let height = Number(variant.height) || 10;
  const dimensionUnit = variant.dimensionUnit || "CM";

  const lengthCm = convertDimensionToCm(length, dimensionUnit);
  const widthCm = convertDimensionToCm(width, dimensionUnit);
  const heightCm = convertDimensionToCm(height, dimensionUnit);

  console.log("📦 Delivery calculation with converted units:", {
    originalWeight: weight,
    weightUnit,
    actualWeightKg,
    originalDimensions: { length, width, height },
    dimensionUnit,
    convertedCm: { lengthCm, widthCm, heightCm },
  });

  const volumetricWeight = calculateVolumetricWeight(
    lengthCm,
    widthCm,
    heightCm,
  );
  const chargeableWeight = getChargeableWeight(
    actualWeightKg,
    volumetricWeight,
  );

  let distanceKm: number = 5;
  if (sellerLat && sellerLng && buyerLat && buyerLng) {
    distanceKm = await getDistanceFromGoogle(
      sellerLat,
      sellerLng,
      buyerLat,
      buyerLng,
    );
  }

  const { deliveryCharge, breakdown } = calculateDeliveryChargeWithBreakdown(
    distanceKm,
    chargeableWeight,
  );

  return {
    distanceKm,
    volumetricWeight: parseFloat(volumetricWeight.toFixed(2)),
    actualWeight: parseFloat(actualWeightKg.toFixed(2)),
    chargeableWeight: parseFloat(chargeableWeight.toFixed(2)),
    deliveryCharge,
    deliveryBreakdown: breakdown,
  };
};
