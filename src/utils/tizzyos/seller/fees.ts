// src/utils/seller/fees.ts
import { CategoryKey, categoryModels } from "../../mappings";

/**
 * Calculate Platform Fee based on product price
 * - Special slabs for high-value items
 * - Multiples of 100 → 15%
 * - Default fallback → 10%
 */
export function calculatePlatformFee(productPrice: number): number {
  if (productPrice <= 100) return Math.round((productPrice * 10) / 100);

  const specialSlabs: Record<number, number> = {
    2000: 20,
    3000: 30,
    4000: 40,
    5000: 50,
    10000: 68,
    20000: 78,
  };

  if (specialSlabs[productPrice]) {
    return Math.round((productPrice * specialSlabs[productPrice]) / 100);
  }

  if (productPrice % 100 === 0) return Math.round((productPrice * 15) / 100);

  return Math.round((productPrice * 10) / 100);
}

/**
 * Calculate Packing Fee based on product price and category
 * - Minimum fee: 10
 * - Dynamic percentage: 1–5% of price
 * - Certain categories have multipliers
 */
export function calculatePackingFee(
  productPrice: number,
  category?: CategoryKey
): number {
  const MIN_PACKING = 10;

  // Category multipliers (adjustable)
  const categoryMultiplier: Record<string, number> = {
    furniture: 2,
    property: 3,
    electronic: 1.5,
    bike: 1.5,
  };

  const multiplier = category ? categoryMultiplier[category] ?? 1 : 1;

  // 1–5% dynamic based on price
  const percent = Math.min(Math.max(productPrice / 1000, 1), 5);

  const fee = Math.round(productPrice * (percent / 100) * multiplier);

  return Math.max(fee, MIN_PACKING);
}
