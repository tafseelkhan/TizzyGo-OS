import axios from "axios";
import { calculateVolumetricWeight, getChargeableWeight, calculateDeliveryChargeWithBreakdown } from "../../utils/tizzygo/calculations";

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
  variant: any
) => {
  let actualWeightGram = Number(variant.weight) || 500;
  let actualWeightKg = actualWeightGram / 1000;

  const lengthCm = Number(variant.length) || 10;
  const widthCm = Number(variant.width) || 10;
  const heightCm = Number(variant.height) || 10;

  const volumetricWeight = calculateVolumetricWeight(lengthCm, widthCm, heightCm);
  const chargeableWeight = getChargeableWeight(actualWeightKg, volumetricWeight);

  let distanceKm: number = 5;
  if (sellerLat && sellerLng && buyerLat && buyerLng) {
    distanceKm = await getDistanceFromGoogle(sellerLat, sellerLng, buyerLat, buyerLng);
  }

  const { deliveryCharge, breakdown } = calculateDeliveryChargeWithBreakdown(distanceKm, chargeableWeight);

  return {
    distanceKm,
    volumetricWeight: parseFloat(volumetricWeight.toFixed(2)),
    actualWeight: parseFloat(actualWeightKg.toFixed(2)),
    chargeableWeight: parseFloat(chargeableWeight.toFixed(2)),
    deliveryCharge,
    deliveryBreakdown: breakdown,
  };
};