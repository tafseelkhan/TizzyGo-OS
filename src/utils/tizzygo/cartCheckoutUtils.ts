import { DELIVERY_RATE_PER_KG, DELIVERY_RATE_PER_KM } from "./calculations";
import {
  CartProductCalculation,
  CartCheckoutSummary,
} from "../../types/tizzygo/cartCheckout";

export const roundToTwoDecimals = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

export const calculateCartSummary = (
  products: CartProductCalculation[],
): CartCheckoutSummary => {
  let subtotal = 0;
  let platformFee = 0;
  let packagingFee = 0;
  let deliveryCharge = 0;
  let discount = 0;

  products.forEach((product) => {
    subtotal += product.calculated.subtotal || 0;
    platformFee += product.calculated.platformFee || 0;
    packagingFee += product.calculated.packagingFee || 0;
    deliveryCharge += product.calculated.deliveryCharge || 0;
    discount += product.calculated.discountAppliedAmount || 0;
  });

  const grandTotal = roundToTwoDecimals(
    subtotal + platformFee + packagingFee + deliveryCharge - discount,
  );

  return {
    subtotal: roundToTwoDecimals(subtotal),
    platformFee: roundToTwoDecimals(platformFee),
    packagingFee: roundToTwoDecimals(packagingFee),
    deliveryCharge: roundToTwoDecimals(deliveryCharge),
    discount: roundToTwoDecimals(discount),
    grandTotal,
  };
};

export const buildCartProductCalculation = (
  product: any,
  cartItem: any,
  deliveryCalculations: any,
  priceCalculations: any,
  couponResult: any,
  platformFee: number,
  packagingFee: number,
  totalBeforeCoupon: number,
  grandTotal: number,
  buyerLocation: any,
  sellerLocation: any,
): CartProductCalculation => {
  return {
    productId: product._id.toString(),
    sellerId: product.sellerId.toString(),
    title: product.title || "Product",
    quantity: cartItem.quantity || 1,
    calculated: {
      mrp: priceCalculations.mrp,
      price: priceCalculations.price,
      finalPrice: priceCalculations.finalPrice,
      savedAmount: priceCalculations.savedAmount,
      discountPercent: priceCalculations.discountPercent,
      totalMrp: priceCalculations.totalMrp,
      totalFinalPrice: priceCalculations.totalFinalPrice,
      totalSavedAmount: priceCalculations.totalSavedAmount,
      gstRate: priceCalculations.gstRate,
      gstType: priceCalculations.gstType,
      gstAmount: priceCalculations.gstAmount,
      perProductGst: priceCalculations.perProductGst,
      platformFee,
      packagingFee,
      deliveryCharge: deliveryCalculations.deliveryCharge || 0,
      distanceKm: deliveryCalculations.distanceKm || 0,
      volumetricWeight: deliveryCalculations.volumetricWeight || 0,
      actualWeight: deliveryCalculations.actualWeight || 0,
      chargeableWeight: deliveryCalculations.chargeableWeight || 0,
      deliveryRatePerKm: DELIVERY_RATE_PER_KM,
      deliveryRatePerKg: DELIVERY_RATE_PER_KG,
      subtotal: priceCalculations.subtotal,
      totalBeforeCoupon,
      discountAppliedAmount: couponResult.discountAmount || 0,
      grandTotal,
      couponUsed: couponResult.usedCoupon || null,
      couponData: couponResult.couponData || null,
      buyerLocation: {
        address: buyerLocation?.address || null,
        latitude: buyerLocation?.latitude || null,
        longitude: buyerLocation?.longitude || null,
        googlePlaceId: buyerLocation?.googlePlaceId || null,
      },
      sellerLocation: {
        address: sellerLocation?.address || null,
        latitude: sellerLocation?.latitude || null,
        longitude: sellerLocation?.longitude || null,
        googlePlaceId: sellerLocation?.googlePlaceId || null,
      },
    },
  };
};
